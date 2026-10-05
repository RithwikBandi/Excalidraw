import { useId, useState } from "react";

import { Icon } from "./Icon";
import { assessPassword, MIN_PASSWORD_LENGTH } from "./passwordStrength";

import type { ReactNode } from "react";

interface BaseProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: ReactNode;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  onBlur?: () => void;
}

const describedBy = (id: string, error?: string | null, hint?: ReactNode) =>
  [error ? `${id}-err` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ") || undefined;

export const TextField = ({
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  inputMode,
  ...rest
}: BaseProps & {
  type?: "text" | "email" | "url";
  inputMode?: "text" | "email" | "url";
}) => {
  const id = useId();
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          {...rest}
        />
      </div>
      {error && (
        <div id={`${id}-err`} className="field-msg error" role="alert">
          {error}
        </div>
      )}
      {hint && !error && (
        <div id={`${id}-hint`} className="field-msg">
          {hint}
        </div>
      )}
    </div>
  );
};

const STRENGTH_COLORS = ["", "bad", "fair", "good", "great"] as const;

export const StrengthMeter = ({
  password,
  personal,
}: {
  password: string;
  personal?: string[];
}) => {
  const a = assessPassword(password, personal);
  const rules: [boolean, string][] = [
    [a.checks.length, `At least ${MIN_PASSWORD_LENGTH} characters`],
    [
      a.checks.variety,
      "Mix of letters, numbers and symbols (or 16+ characters)",
    ],
    [a.checks.notObvious, "No common words, repeats or your name"],
  ];
  return (
    <div className="strength" aria-live="polite">
      <div
        className={`strength__bar ${STRENGTH_COLORS[a.score]}`}
        aria-hidden="true"
      >
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= a.score ? "on" : ""} />
        ))}
      </div>
      <div className="strength__label">
        {password
          ? `Password strength: ${a.label}`
          : "Choose a strong password"}
      </div>
      <ul className="strength__rules">
        {rules.map(([ok, text]) => (
          <li key={text} className={ok && password ? "ok" : ""}>
            <Icon name={ok && password ? "check" : "circle"} size={12} />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const PasswordField = ({
  label,
  value,
  onChange,
  error,
  hint,
  showStrength,
  personal,
  minLength,
  ...rest
}: BaseProps & {
  showStrength?: boolean;
  personal?: string[];
  minLength?: number;
}) => {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap has-adorn">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          minLength={minLength}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          {...rest}
          onBlur={() => {
            setCaps(false);
            rest.onBlur?.();
          }}
        />
        <button
          type="button"
          className="adorn"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          <Icon name={shown ? "eyeOff" : "eye"} size={18} />
        </button>
      </div>
      {caps && (
        <div className="field-msg warn" role="status">
          <Icon name="alert" size={13} /> Caps Lock is on
        </div>
      )}
      {error && (
        <div id={`${id}-err`} className="field-msg error" role="alert">
          {error}
        </div>
      )}
      {hint && !error && (
        <div id={`${id}-hint`} className="field-msg">
          {hint}
        </div>
      )}
      {showStrength && <StrengthMeter password={value} personal={personal} />}
    </div>
  );
};
