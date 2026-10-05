import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";

import { post } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { Modal } from "../components/Modal";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";

import { useWorkspace, WorkspaceProvider } from "./WorkspaceContext";

import type { Folder } from "../api/types";

const FolderTree = ({
  folders,
  parent,
  depth,
  wsId,
}: {
  folders: Folder[];
  parent: string | null;
  depth: number;
  wsId: string;
}) => (
  <>
    {folders
      .filter((f) => f.parentId === parent)
      .map((f) => (
        <div key={f.id}>
          <NavLink
            to={`/w/${wsId}/folder/${f.id}`}
            className="nav-item"
            style={{ paddingLeft: 12 + depth * 14 }}
          >
            <span className="ico">
              <Icon name="folder" size={16} />
            </span>
            <span className="ellipsis">{f.name}</span>
          </NavLink>
          <FolderTree
            folders={folders}
            parent={f.id}
            depth={depth + 1}
            wsId={wsId}
          />
        </div>
      ))}
  </>
);

const tileLetter = (name: string) => [...name.trim()][0]?.toUpperCase() ?? "?";

/** Workspace menu: replaces the native <select>, which rendered as an unstyled OS list. */
const WorkspaceSwitcher = ({ onNew }: { onNew: () => void }) => {
  const { workspaces, current, select } = useWorkspace();
  const { features } = useAuth();
  const nav = useNavigate();
  const multiUser = features?.workspaces !== false;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLElement>(".ws-btn")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) {
    return null;
  }
  return (
    <div className="ws-switch" ref={root}>
      <button
        type="button"
        className="ws-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${current.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ws-tile">{tileLetter(current.name)}</span>
        <span className="ws-meta">
          <span className="name ellipsis">{current.name}</span>
          <span className="sub">{current.role.toLowerCase()}</span>
        </span>
        <Icon name="chevronsUpDown" size={15} />
      </button>
      {open && (
        <div className="ws-menu" role="menu" aria-label="Workspaces">
          <div className="label">Workspaces</div>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitemradio"
              aria-checked={w.id === current.id}
              className="ws-item"
              autoFocus={w.id === current.id}
              onClick={() => {
                setOpen(false);
                if (w.id !== current.id) {
                  select(w.id);
                  nav(`/w/${w.id}`);
                }
              }}
            >
              <span className="ws-tile" style={{ width: 24, height: 24 }}>
                {tileLetter(w.name)}
              </span>
              <span className="ellipsis">{w.name}</span>
              {w.id === current.id && (
                <Icon name="check" size={15} className="tick" />
              )}
            </button>
          ))}
          {multiUser && (
            <>
              <div className="ws-sep" />
              <button
                type="button"
                role="menuitem"
                className="ws-item add"
                onClick={() => {
                  setOpen(false);
                  onNew();
                }}
              >
                <Icon name="plusCircle" size={18} /> New workspace…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { current, folders, select, reload, reloadFolders } = useWorkspace();
  const nav = useNavigate();
  const [creating, setCreating] = useState<"workspace" | "folder" | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const create = async () => {
    setErr("");
    try {
      if (creating === "workspace") {
        const { workspace } = await post("/workspaces", { name });
        await reload();
        select(workspace.id);
        nav(`/w/${workspace.id}`);
      } else if (current) {
        await post(`/workspaces/${current.id}/folders`, { name });
        await reloadFolders();
      }
      setCreating(null);
      setName("");
    } catch (e: any) {
      setErr(
        e.code === "folder_exists" ? "That folder already exists." : e.message,
      );
    }
  };

  if (!current) {
    return <aside className="sidebar" />;
  }
  const base = `/w/${current.id}`;
  return (
    <aside className="sidebar">
      <WorkspaceSwitcher onNew={() => setCreating("workspace")} />
      <nav className="nav">
        <NavLink end to={base} className="nav-item">
          <span className="ico">
            <Icon name="home" size={17} />
          </span>
          Home
        </NavLink>
        <NavLink to={`${base}/recent`} className="nav-item">
          <span className="ico">
            <Icon name="clock" size={17} />
          </span>
          Recent
        </NavLink>
        <NavLink to={`${base}/mine`} className="nav-item">
          <span className="ico">
            <Icon name="pencil" size={17} />
          </span>
          My scenes
        </NavLink>
        <NavLink to={`${base}/shared`} className="nav-item">
          <span className="ico">
            <Icon name="arrowsLR" size={17} />
          </span>
          Shared with me
        </NavLink>
        <div className="nav-section">
          <span>Folders</span>
          <button
            className="icon-btn"
            title="New folder"
            aria-label="New folder"
            onClick={() => setCreating("folder")}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
        <FolderTree
          folders={folders}
          parent={null}
          depth={0}
          wsId={current.id}
        />
        {folders.length === 0 && (
          <div className="muted small pad">No folders yet</div>
        )}
        <div className="nav-section">
          <span>Workspace</span>
        </div>
        <NavLink to={`${base}/libraries`} className="nav-item">
          <span className="ico">
            <Icon name="layers" size={17} />
          </span>
          Libraries
        </NavLink>
        <NavLink to={`${base}/trash`} className="nav-item">
          <span className="ico">
            <Icon name="trash" size={17} />
          </span>
          Trash
        </NavLink>
        <NavLink to={`${base}/settings`} className="nav-item">
          <span className="ico">
            <Icon name="sliders" size={17} />
          </span>
          Settings
        </NavLink>
      </nav>
      <div className="user-box">
        <NavLink
          to={`${base}/settings/profile`}
          className="user-link"
          aria-label="Edit your profile"
        >
          <Avatar
            name={user?.displayName ?? "?"}
            src={user?.avatarUrl}
            size={34}
          />
          <div className="user-meta">
            <div className="ellipsis strong">{user?.displayName}</div>
            <div className="ellipsis muted small">{user?.email}</div>
          </div>
        </NavLink>
        <button
          className="icon-btn"
          title="Sign out"
          aria-label="Sign out"
          onClick={() => logout().then(() => nav("/login"))}
        >
          <Icon name="logOut" size={17} />
        </button>
      </div>
      {creating && (
        <Modal
          title={creating === "workspace" ? "New workspace" : "New folder"}
          onClose={() => setCreating(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              maxLength={80}
              required
            />
            {err && <div className="form-error">{err}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setCreating(null)}
              >
                Cancel
              </button>
              <button className="btn primary">Create</button>
            </div>
          </form>
        </Modal>
      )}
    </aside>
  );
};

export const Shell = () => {
  const { workspaceId } = useParams();
  const nav = useNavigate();
  const onSelect = useCallback((id: string) => nav(`/w/${id}`), [nav]);
  return (
    <WorkspaceProvider routeId={workspaceId} onSelect={onSelect}>
      <div className="shell">
        <Sidebar />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </WorkspaceProvider>
  );
};
