import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon } from "./Icon";

import type { ReactNode } from "react";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

type Push = (message: string, tone?: Tone) => void;
const Ctx = createContext<Push>(() => {});

export const useToast = () => useContext(Ctx);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback(
    (id: number) => setItems((l) => l.filter((t) => t.id !== id)),
    [],
  );
  const push = useCallback<Push>(
    (message, tone = "success") => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 6500 : 3500);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.tone}`}
            role={t.tone === "error" ? "alert" : "status"}
          >
            <Icon
              name={
                t.tone === "success"
                  ? "check"
                  : t.tone === "error"
                  ? "alert"
                  : "info"
              }
              size={16}
            />
            <span>{t.message}</span>
            <button
              type="button"
              className="toast__x"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
};
