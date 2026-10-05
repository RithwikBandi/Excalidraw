import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { PasswordField, TextField } from "../ui/Fields";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { MIN_PASSWORD_LENGTH } from "../ui/passwordStrength";

import type { FormEvent } from "react";

const messages: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  email_taken: "An account with that email already exists.",
  validation_error: "Please check the highlighted fields.",
  network_error: "Cannot reach the server. Is the backend running?",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "displayName" | "email" | "password";
type Errors = Partial<Record<Field, string>>;

const POINTS = [
  "Real-time collaboration with live cursors",
  "Your drawings never leave your server",
  "Export to PDF and editable PowerPoint",
];

const Aside = () => (
  <aside className="auth2-aside" aria-hidden="true">
    <svg
      className="auth2-scribble"
      viewBox="0 0 400 300"
      fill="none"
      stroke="#fff"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="24" y="30" width="150" height="96" rx="14" />
      <rect x="226" y="150" width="150" height="104" rx="14" />
      <path d="M174 78c36 0 34 74 52 74" />
      <path d="m216 140 10 12-14 6" />
      <path d="M52 214c20-26 38-26 52 0s32 26 50-4" />
      <circle cx="318" cy="64" r="26" />
      <path d="m306 66 8 8 14-18" />
    </svg>
    <div className="auth2-brand">
      <Logo size={36} />
      Excalidraw Workspace
    </div>
    <div className="auth2-hero">
      <h2>Think visually. Build together.</h2>
      <p>
        A private whiteboard for your team. Draw, comment and present, all on
        infrastructure you control.
      </p>
      <ul className="auth2-points">
        {POINTS.map((p) => (
          <li key={p}>
            <span className="tick">
              <Icon name="check" size={13} strokeWidth={2.6} />
            </span>
            {p}
          </li>
        ))}
      </ul>
    </div>
    <div className="auth2-foot">
      Self-hosted · Powered by the Excalidraw editor
    </div>
  </aside>
);

export const AuthPage = ({ mode }: { mode: "login" | "register" }) => {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const isLogin = mode === "login";

  useEffect(() => {
    document.title = `${
      isLogin ? "Sign in" : "Create account"
    } · Excalidraw Workspace`;
  }, [isLogin]);

  // switching between the two modes must not carry over errors
  useEffect(() => {
    setErrors({});
    setError(null);
  }, [mode]);

  if (user) {
    return <Navigate to={loc.state?.from ?? "/"} replace />;
  }

  const shake = () => {
    const el = formRef.current;
    if (el) {
      el.classList.remove("shake");
      void el.offsetWidth; // restart the animation
      el.classList.add("shake");
    }
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!isLogin && !displayName.trim()) {
      e.displayName = "Tell us what to call you.";
    }
    if (!email.trim()) {
      e.email = "Enter your email address.";
    } else if (!EMAIL.test(email.trim())) {
      e.email = "That doesn't look like an email address.";
    }
    if (!password) {
      e.password = isLogin ? "Enter your password." : "Choose a password.";
    } else if (!isLogin && password.length < MIN_PASSWORD_LENGTH) {
      e.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) {
      return;
    }
    const found = validate();
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) {
      shake();
      return;
    }
    setBusy(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, displayName.trim());
      }
      nav(loc.state?.from ?? "/", { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "error";
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else if (code === "email_taken") {
        setErrors({ email: messages.email_taken });
      } else if (err instanceof ApiError && code === "validation_error") {
        // map the server's per-field issues back onto the form
        const mapped: Errors = {};
        for (const i of err.body?.issues ?? []) {
          const key = String(
            Array.isArray(i.path) ? i.path[0] : String(i.path).split(".")[0],
          ) as Field;
          if (key === "email" || key === "password" || key === "displayName") {
            mapped[key] ??= i.message;
          }
        }
        if (Object.keys(mapped).length) {
          setErrors(mapped);
        } else {
          setError(messages.validation_error!);
        }
      } else {
        setError(messages[code] ?? "Something went wrong. Please try again.");
      }
      shake();
    } finally {
      setBusy(false);
    }
  };

  const clear = (f: Field) =>
    setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));

  return (
    <main className="auth2">
      <Aside />
      <div className="auth2-main">
        <div className="auth2-card">
          <div className="mobile-brand">
            <Logo size={30} />
            Excalidraw Workspace
          </div>
          <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="lede">
            {isLogin
              ? "Sign in to your self-hosted workspace."
              : "Your drawings stay on your own server."}
          </p>
          <form ref={formRef} onSubmit={submit} noValidate>
            {!isLogin && (
              <TextField
                label="Display name"
                value={displayName}
                onChange={(v) => {
                  setDisplayName(v);
                  clear("displayName");
                }}
                error={errors.displayName}
                maxLength={80}
                autoComplete="name"
                autoFocus
              />
            )}
            <TextField
              label="Email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(v) => {
                setEmail(v);
                clear("email");
              }}
              error={errors.email}
              autoComplete="email"
              autoFocus={isLogin}
              maxLength={254}
            />
            <PasswordField
              label="Password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                clear("password");
              }}
              error={errors.password}
              autoComplete={isLogin ? "current-password" : "new-password"}
              maxLength={128}
              showStrength={!isLogin}
              personal={[displayName, email.split("@")[0] ?? ""]}
            />
            {error && (
              <div className="auth-alert" role="alert">
                <Icon name="alert" size={16} />
                <span>{error}</span>
              </div>
            )}
            <button className="btn primary auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {isLogin ? "Signing in…" : "Creating account…"}
                </>
              ) : isLogin ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </button>
          </form>
          <p className="auth2-switch">
            {isLogin ? (
              <>
                New here?{" "}
                <Link to="/register" state={loc.state}>
                  Create an account
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link to="/login" state={loc.state}>
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  );
};
