import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";

import { del, get, patch, post, put } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { AiSettings } from "../components/AiSettings";
import { ApiKeysSettings } from "../components/ApiKeys";
import { Modal } from "../components/Modal";
import { timeAgo } from "../components/util";
import { useWorkspace } from "../layout/WorkspaceContext";
import { Avatar } from "../ui/Avatar";
import { AvatarEditor, blobToBase64 } from "../ui/AvatarEditor";
import { useConfirm } from "../ui/ConfirmProvider";
import { PasswordField } from "../ui/Fields";
import { Icon } from "../ui/Icon";
import { MIN_PASSWORD_LENGTH } from "../ui/passwordStrength";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";

import type { FormEvent } from "react";
import type { Member, Role } from "../api/types";
import type { IconName } from "../ui/Icon";

type TabId =
  | "profile"
  | "security"
  | "workspace"
  | "members"
  | "ai"
  | "keys"
  | "audit";

interface TabDef {
  id: TabId;
  label: string;
  icon: IconName;
  title: string;
  description: (ws: string) => string;
  adminOnly?: boolean;
}

const ACCOUNT_TABS: TabDef[] = [
  {
    id: "profile",
    label: "Profile",
    icon: "user",
    title: "Profile",
    description: () => "Your photo and personal details.",
  },
  {
    id: "security",
    label: "Security",
    icon: "lock",
    title: "Security",
    description: () => "Keep your account safe.",
  },
];

const WORKSPACE_TABS: TabDef[] = [
  {
    id: "workspace",
    label: "General",
    icon: "briefcase",
    title: "General",
    description: (ws) => `Settings for ${ws}.`,
  },
  {
    id: "members",
    label: "Members",
    icon: "users",
    title: "Members",
    description: (ws) => `People who can access ${ws}.`,
  },
  {
    id: "ai",
    label: "AI",
    icon: "sparkles",
    title: "AI",
    description: () => "Connect a provider to turn text into diagrams.",
  },
  {
    id: "keys",
    label: "API keys",
    icon: "key",
    title: "API keys",
    description: () => "Programmatic access for scripts and AI agents.",
    adminOnly: true,
  },
  {
    id: "audit",
    label: "Audit log",
    icon: "list",
    title: "Audit log",
    description: () => "Recent activity in this workspace.",
    adminOnly: true,
  },
];

export const SettingsPage = () => {
  const { tab = "profile", workspaceId } = useParams();
  const { features } = useAuth();
  const { current } = useWorkspace();
  const isMember = current?.role === "MEMBER";
  const multiUser = features?.workspaces !== false;

  const wsTabs = WORKSPACE_TABS.filter(
    (t) =>
      // single-user mode (ENABLE_WORKSPACES=false) has no member management
      (t.id !== "members" || multiUser) && !(t.adminOnly && isMember),
  );
  const all = [...ACCOUNT_TABS, ...WORKSPACE_TABS];
  const def = all.find((t) => t.id === tab) ?? ACCOUNT_TABS[0]!;
  const wsName = current?.name ?? "this workspace";
  const blocked = def.adminOnly && isMember;

  const rail = (tabs: TabDef[], label: string) => (
    <div role="tablist" aria-orientation="vertical" aria-label={label}>
      {tabs.map((t) => (
        <NavLink
          key={t.id}
          role="tab"
          aria-selected={def.id === t.id}
          to={`/w/${workspaceId}/settings/${t.id}`}
          className={() => (def.id === t.id ? "rail-item active" : "rail-item")}
        >
          <Icon name={t.icon} size={17} />
          {t.label}
        </NavLink>
      ))}
    </div>
  );

  return (
    <div className="settings">
      <nav className="settings-rail" aria-label="Settings">
        <h1>Settings</h1>
        <div className="rail-group">Account</div>
        {rail(ACCOUNT_TABS, "Account settings")}
        <div className="rail-group ellipsis" title={wsName}>
          {wsName}
        </div>
        {rail(wsTabs, "Workspace settings")}
      </nav>
      <section className="settings-body" aria-labelledby="settings-title">
        <header className="settings-head">
          <h2 id="settings-title">{def.title}</h2>
          <p>{def.description(wsName)}</p>
        </header>
        {blocked ? (
          <div className="card">
            <div className="empty">
              Only workspace owners and admins can manage this.
            </div>
          </div>
        ) : (
          <>
            {def.id === "profile" && <ProfileTab />}
            {def.id === "security" && <SecurityTab />}
            {def.id === "workspace" && <WorkspaceTab />}
            {def.id === "members" && <MembersTab />}
            {def.id === "ai" && <AiSettings />}
            {def.id === "keys" && <ApiKeysSettings />}
            {def.id === "audit" && <AuditTab />}
          </>
        )}
      </section>
    </div>
  );
};

const errMsg = (e: any, fallback = "Something went wrong.") =>
  e?.message && e.message !== e?.code ? e.message : fallback;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

/** A settings row whose value is edited in place after pressing "Edit". */
const InlineEditRow = ({
  label,
  description,
  value,
  onSave,
  disabled,
  lockedHint,
  maxLength = 80,
}: {
  label: string;
  description?: string;
  value: string;
  onSave: (next: string) => Promise<void>;
  disabled?: boolean;
  lockedHint?: string;
  maxLength?: number;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const clean = draft.trim();
  const canSave = !!clean && clean !== value && !busy;

  const save = async () => {
    if (!canSave) {
      return;
    }
    setBusy(true);
    try {
      await onSave(clean);
      setEditing(false);
    } catch {
      // the caller already told the user; keep the field open to retry
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="item">
        <div className="item-main">
          <div className="item-label">{label}</div>
          <form
            className="item-edit"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              autoFocus
              value={draft}
              maxLength={maxLength}
              aria-label={label}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(false);
                }
              }}
            />
            <button className="btn primary" disabled={!canSave}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }
  return (
    <div className="item">
      <div className="item-main">
        <div className="item-label">{label}</div>
        <div className="item-value">{value}</div>
        {description && <div className="item-desc">{description}</div>}
      </div>
      <div className="item-ctrl">
        {disabled ? (
          lockedHint && (
            <span className="muted small" title={lockedHint}>
              <Icon name="lock" size={14} /> {lockedHint}
            </span>
          )
        ) : (
          <button
            className="btn"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            <Icon name="pencil" size={14} /> Edit
          </button>
        )}
      </div>
    </div>
  );
};

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

const ProfileTab = () => {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);

  if (!user) {
    return null;
  }

  const onFile = (f: File | undefined) => {
    if (fileInput.current) {
      fileInput.current.value = ""; // let the same file be chosen again later
    }
    if (!f) {
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast("Please choose an image file.", "error");
    } else if (f.size > MAX_PHOTO_BYTES) {
      toast("That photo is too large (max 12 MB).", "error");
    } else {
      setPicked(f);
    }
  };

  const savePhoto = async (blob: Blob) => {
    const r = await put("/me/avatar", {
      mimeType: blob.type,
      dataBase64: await blobToBase64(blob),
    });
    setUser(r.user);
    setPicked(null);
    toast("Profile photo updated.");
  };

  const removePhoto = async () => {
    const ok = await confirm({
      title: "Remove profile photo?",
      message: "Your initial will be shown instead.",
      confirmLabel: "Remove photo",
      tone: "danger",
    });
    if (!ok) {
      return;
    }
    try {
      const r = await del("/me/avatar");
      setUser(r.user);
      toast("Profile photo removed.");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  return (
    <>
      <div className="card">
        <div className="profile-hero">
          <button
            type="button"
            className="avatar-pick"
            aria-label="Change profile photo"
            onClick={() => fileInput.current?.click()}
          >
            <Avatar name={user.displayName} src={user.avatarUrl} size={96} />
            <span className="avatar-pick__badge" aria-hidden="true">
              <Icon name="camera" size={15} />
            </span>
          </button>
          <div>
            <h3>{user.displayName}</h3>
            <div className="sub">{user.email}</div>
            <div className="actions">
              <button
                className="btn primary"
                onClick={() => fileInput.current?.click()}
              >
                <Icon name="camera" size={15} />
                {user.avatarUrl ? "Change photo" : "Upload photo"}
              </button>
              {user.avatarUrl && (
                <button className="btn" onClick={() => void removePhoto()}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden-file"
            aria-label="Choose a profile photo"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      </div>

      <div>
        <h3 className="section-title">Account</h3>
        <div className="card">
          <InlineEditRow
            label="Display name"
            description="Shown to teammates in comments, sharing and live sessions."
            value={user.displayName}
            onSave={async (name) => {
              try {
                const r = await patch("/me", { displayName: name });
                setUser(r.user);
                toast("Display name updated.");
              } catch (e) {
                toast(errMsg(e), "error");
                throw e;
              }
            }}
          />
          <div className="item">
            <div className="item-main">
              <div className="item-label">Email</div>
              <div className="item-value">{user.email}</div>
              <div className="item-desc">
                You sign in with this address. It can’t be changed here.
              </div>
            </div>
            <div className="item-ctrl muted small">
              <Icon name="lock" size={14} /> Locked
            </div>
          </div>
          <div className="item">
            <div className="item-main">
              <div className="item-label">Member since</div>
              <div className="item-value">{fmtDate(user.createdAt)}</div>
            </div>
          </div>
        </div>
      </div>

      {picked && (
        <AvatarEditor
          file={picked}
          onCancel={() => setPicked(null)}
          onSave={savePhoto}
        />
      )}
    </>
  );
};

const PasswordDialog = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<{
    cur?: string;
    next?: string;
    again?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!cur) {
      found.cur = "Enter your current password.";
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      found.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    } else if (next === cur) {
      found.next = "Choose a password different from your current one.";
    }
    if (again !== next) {
      found.again = "The passwords don’t match.";
    }
    setErrors(found);
    if (Object.keys(found).length) {
      return;
    }
    setBusy(true);
    try {
      await post("/me/password", { currentPassword: cur, newPassword: next });
      toast("Password changed. Other devices were signed out.");
      onClose();
    } catch (err: any) {
      if (err?.code === "invalid_credentials") {
        setErrors({ cur: "That isn’t your current password." });
      } else if (err?.status === 429) {
        setErrors({ cur: "Too many attempts. Wait a minute and try again." });
      } else {
        setErrors({ next: errMsg(err, "Couldn’t change the password.") });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Change password" onClose={onClose}>
      <form className="pw-dialog" onSubmit={submit} noValidate>
        <PasswordField
          label="Current password"
          value={cur}
          onChange={(v) => {
            setCur(v);
            setErrors((x) => ({ ...x, cur: undefined }));
          }}
          error={errors.cur}
          autoComplete="current-password"
          maxLength={128}
          autoFocus
        />
        <PasswordField
          label="New password"
          value={next}
          onChange={(v) => {
            setNext(v);
            setErrors((x) => ({ ...x, next: undefined }));
          }}
          error={errors.next}
          autoComplete="new-password"
          maxLength={128}
          showStrength
          personal={[user?.displayName ?? "", user?.email.split("@")[0] ?? ""]}
        />
        <PasswordField
          label="Confirm new password"
          value={again}
          onChange={(v) => {
            setAgain(v);
            setErrors((x) => ({ ...x, again: undefined }));
          }}
          error={errors.again}
          autoComplete="new-password"
          maxLength={128}
        />
        <p className="muted small" style={{ margin: 0 }}>
          Changing your password signs you out of every other device.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const SecurityTab = () => {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [changing, setChanging] = useState(false);
  return (
    <>
      <div className="card">
        <div className="item">
          <div className="item-main">
            <div className="item-label">Password</div>
            <div className="item-desc">
              Use a long, unique password. You’ll be asked for your current one.
            </div>
          </div>
          <div className="item-ctrl">
            <button className="btn" onClick={() => setChanging(true)}>
              <Icon name="lock" size={14} /> Change password
            </button>
          </div>
        </div>
        <div className="item">
          <div className="item-main">
            <div className="item-label">Sign out</div>
            <div className="item-desc">End your session on this device.</div>
          </div>
          <div className="item-ctrl">
            <button
              className="btn"
              onClick={() => logout().then(() => nav("/login"))}
            >
              <Icon name="logOut" size={14} /> Sign out
            </button>
          </div>
        </div>
      </div>
      {changing && <PasswordDialog onClose={() => setChanging(false)} />}
    </>
  );
};

const RoleBadge = ({ role }: { role: Role }) => (
  <span className={`role-badge ${role.toLowerCase()}`}>{role}</span>
);

const WorkspaceTab = () => {
  const { features } = useAuth();
  const { current, reload } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  if (!current) {
    return null;
  }
  const canEdit = current.role !== "MEMBER";
  return (
    <>
      <div className="card">
        <InlineEditRow
          label="Workspace name"
          description="Shown in the sidebar and to everyone you invite."
          value={current.name}
          disabled={!canEdit}
          lockedHint="Admins only"
          onSave={async (name) => {
            try {
              await patch(`/workspaces/${current.id}`, { name });
              await reload();
              toast("Workspace renamed.");
            } catch (e) {
              toast(errMsg(e), "error");
              throw e;
            }
          }}
        />
        <div className="item">
          <div className="item-main">
            <div className="item-label">Your role</div>
            <div className="item-desc">
              {current.role === "OWNER"
                ? "You own this workspace and can manage everything."
                : current.role === "ADMIN"
                ? "You can manage members, settings and API keys."
                : "You can create and edit scenes."}
            </div>
          </div>
          <div className="item-ctrl">
            <RoleBadge role={current.role} />
          </div>
        </div>
      </div>

      {current.role === "OWNER" && features?.workspaces !== false && (
        <div>
          <h3 className="section-title">Danger zone</h3>
          <div className="card danger">
            <div className="item">
              <div className="item-main">
                <div className="item-label">Delete this workspace</div>
                <div className="item-desc">
                  Permanently removes all its scenes, folders and images. This
                  can’t be undone.
                </div>
              </div>
              <div className="item-ctrl">
                <button
                  className="btn danger"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Delete workspace?",
                      message: `“${current.name}” and everything in it will be permanently deleted.`,
                      confirmLabel: "Delete workspace",
                      tone: "danger",
                      requireText: current.name,
                    });
                    if (!ok) {
                      return;
                    }
                    try {
                      await del(`/workspaces/${current.id}`);
                      await reload();
                      toast("Workspace deleted.");
                      nav("/");
                    } catch (e) {
                      toast(errMsg(e), "error");
                    }
                  }}
                >
                  Delete workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const MembersTab = () => {
  const { current, reload } = useWorkspace();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (current) {
      setMembers((await get(`/workspaces/${current.id}/members`)).members);
    }
  }, [current]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  if (!current) {
    return null;
  }
  const isOwner = current.role === "OWNER";
  const canManage = current.role !== "MEMBER";
  // owners manage anyone but themselves; admins manage plain members only
  const manageable = (m: Member) =>
    canManage && m.role !== "OWNER" && (isOwner || m.role === "MEMBER");

  const run = async (fn: () => Promise<any>, ok?: string) => {
    try {
      const r = await fn();
      if (r?.members) {
        setMembers(r.members);
      } else {
        await load();
      }
      if (ok) {
        toast(ok);
      }
    } catch (e: any) {
      toast(
        e.code === "user_not_found"
          ? "No registered user has that email."
          : e.code === "already_member"
          ? "That person is already a member."
          : errMsg(e),
        "error",
      );
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    await run(async () => {
      const r = await post(`/workspaces/${current.id}/members`, {
        email: email.trim(),
        role,
      });
      setEmail("");
      return r;
    }, "Member added.");
    setAdding(false);
  };

  const remove = async (m: Member) => {
    const self = m.userId === user?.id;
    const ok = await confirm({
      title: self ? "Leave workspace?" : `Remove ${m.displayName}?`,
      message: self
        ? `You’ll lose access to “${current.name}” and its scenes.`
        : `${m.displayName} will lose access to “${current.name}” right away.`,
      confirmLabel: self ? "Leave" : "Remove",
      tone: "danger",
    });
    if (!ok) {
      return;
    }
    await run(
      async () => {
        await del(`/workspaces/${current.id}/members/${m.userId}`);
        if (self) {
          await reload();
          nav("/");
        }
      },
      self ? undefined : "Member removed.",
    );
  };

  const roleOptions = [
    {
      value: "MEMBER" as const,
      label: "Member",
      hint: "Create and edit scenes",
    },
    ...(isOwner
      ? [
          {
            value: "ADMIN" as const,
            label: "Admin",
            hint: "Also manage members and settings",
          },
        ]
      : []),
  ];

  return (
    <div className="card">
      {canManage ? (
        <>
          <form className="add-bar" onSubmit={add}>
            <input
              type="email"
              required
              placeholder="Add member by email"
              aria-label="Email of the person to add"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Select
              value={role}
              onChange={setRole}
              options={roleOptions}
              ariaLabel="Role for the new member"
            />
            <button className="btn primary" disabled={adding || !email.trim()}>
              Add
            </button>
          </form>
          <p className="add-note" style={{ paddingTop: 10 }}>
            They need an existing account on this server.{" "}
            {isOwner
              ? "Only you (the owner) can add admins."
              : "Only the owner can add admins."}
          </p>
        </>
      ) : (
        <div className="readonly-note">
          <Icon name="lock" size={16} />
          Only owners and admins can add or remove people.
        </div>
      )}
      <div>
        {members.map((m) => {
          const self = m.userId === user?.id;
          const canRemove = m.role !== "OWNER" && (self || manageable(m));
          return (
            <div className="member" key={m.userId}>
              <Avatar name={m.displayName} src={m.avatarUrl} size={38} />
              <div className="member-info">
                <div className="strong ellipsis">
                  {m.displayName}
                  {self ? " (you)" : ""}
                </div>
                <div className="muted small ellipsis">{m.email}</div>
              </div>
              <div className="member-ctrl">
                {manageable(m) ? (
                  <Select
                    size="sm"
                    align="end"
                    value={m.role as "ADMIN" | "MEMBER"}
                    ariaLabel={`Role of ${m.displayName}`}
                    options={roleOptions}
                    onChange={(r) =>
                      run(
                        () =>
                          patch(
                            `/workspaces/${current.id}/members/${m.userId}`,
                            { role: r },
                          ),
                        "Role updated.",
                      )
                    }
                  />
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {canRemove && (
                  <button
                    className="btn ghost danger small"
                    onClick={() => void remove(m)}
                  >
                    {self ? "Leave" : "Remove"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ACTIONS: Record<string, string> = {
  WORKSPACE_UPDATED: "Workspace renamed",
  WORKSPACE_DELETED: "Workspace deleted",
  USER_INVITED: "Member added",
  USER_REMOVED: "Member removed",
  ROLE_CHANGED: "Role changed",
  SCENE_PURGED: "Scene permanently deleted",
};
const niceAction = (a: string) =>
  ACTIONS[a] ??
  a
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

const detail = (l: any) => {
  const m = l.meta ?? {};
  if (l.action === "ROLE_CHANGED" && m.from && m.to) {
    return `${m.from} → ${m.to}`;
  }
  return Object.entries(m)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" · ");
};

const AuditTab = () => {
  const { current } = useWorkspace();
  const [logs, setLogs] = useState<any[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!current) {
      return;
    }
    get(`/workspaces/${current.id}/audit`)
      .then((r) => setLogs(r.logs))
      .catch((e) =>
        setErr(
          e.status === 403 ? "Only admins can view the audit log." : e.message,
        ),
      );
    // resolve actor ids to names (best effort)
    get(`/workspaces/${current.id}/members`)
      .then((r) =>
        setNames(
          Object.fromEntries(
            (r.members as Member[]).map((m) => [m.userId, m.displayName]),
          ),
        ),
      )
      .catch(() => {});
  }, [current]);

  if (err) {
    return (
      <div className="card">
        <div className="empty">{err}</div>
      </div>
    );
  }
  if (!logs) {
    return (
      <div className="card">
        <div className="empty">Loading…</div>
      </div>
    );
  }
  return (
    <div className="card">
      {logs.length === 0 ? (
        <div className="empty">No activity yet.</div>
      ) : (
        <ul className="audit">
          {logs.map((l) => {
            const who = l.actorId ? names[l.actorId] : null;
            const extra = detail(l);
            return (
              <li key={l.id}>
                <div>
                  <div className="what">{niceAction(l.action)}</div>
                  <div className="muted small">
                    {who ? `by ${who}` : "by a former member"}
                    {extra ? ` · ${extra}` : ""}
                  </div>
                </div>
                <time className="when" dateTime={l.createdAt}>
                  {timeAgo(l.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
