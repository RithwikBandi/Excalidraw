import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { Modal } from "../components/Modal";

import { Icon } from "./Icon";

import type { ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** the user must type this exactly before the confirm button unlocks */
  requireText?: string;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const Ctx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

/** Promise-based replacement for window.confirm(), styled like the rest of the app. */
export const useConfirm = () => {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useConfirm outside ConfirmProvider");
  }
  return v;
};

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const [typed, setTyped] = useState("");

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped("");
        setPending({ ...o, resolve });
      }),
    [],
  );
  const value = useMemo(() => confirm, [confirm]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  const danger = pending?.tone === "danger";
  const locked = !!pending?.requireText && typed !== pending.requireText;

  return (
    <Ctx.Provider value={value}>
      {children}
      {pending && (
        <Modal title={pending.title} onClose={() => close(false)}>
          <form
            className="confirm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!locked) {
                close(true);
              }
            }}
          >
            <div className={`confirm__icon${danger ? " danger" : ""}`}>
              <Icon name={danger ? "alert" : "info"} size={20} />
            </div>
            {pending.message && (
              <div className="confirm__body">{pending.message}</div>
            )}
            {pending.requireText && (
              <label className="confirm__type">
                <span>
                  Type <strong>{pending.requireText}</strong> to confirm
                </span>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                autoFocus={!pending.requireText}
                onClick={() => close(false)}
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="submit"
                className={`btn ${danger ? "danger" : "primary"}`}
                disabled={locked}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Ctx.Provider>
  );
};
