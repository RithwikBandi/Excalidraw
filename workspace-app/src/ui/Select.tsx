import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";

import type { KeyboardEvent } from "react";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  size?: "sm" | "md";
  /** stretch the trigger to its container's width */
  block?: boolean;
  disabled?: boolean;
  /** which edge of the trigger the menu lines up with */
  align?: "start" | "end";
  placeholder?: string;
}

interface Pos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Accessible custom dropdown (ARIA combobox + listbox). Replaces the native
 * <select> so menus look the same everywhere, support descriptions and
 * keyboard / type-ahead, and are never clipped by overflow containers (the
 * menu renders in a portal and flips upward when there is no room below).
 */
export const Select = <T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  size = "md",
  block = false,
  disabled = false,
  align = "start",
  placeholder = "Select…",
}: SelectProps<T>) => {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", timer: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const isEnabled = (i: number) => !!options[i] && !options[i]!.disabled;
  const firstEnabled = () => options.findIndex((_, i) => isEnabled(i));
  const lastEnabled = () => {
    for (let i = options.length - 1; i >= 0; i--) {
      if (isEnabled(i)) {
        return i;
      }
    }
    return -1;
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
      if (isEnabled(i)) {
        return i;
      }
    }
    return from;
  };

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.max(r.width, 200);
    const left = Math.min(
      Math.max(8, align === "end" ? r.right - width : r.left),
      Math.max(8, vw - width - 8),
    );
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const wanted = Math.min(320, options.length * 38 + 12);
    if (below < wanted && above > below) {
      setPos({
        left,
        width,
        bottom: vh - r.top + 6,
        maxHeight: Math.min(320, above),
      });
    } else {
      setPos({
        left,
        width,
        top: r.bottom + 6,
        maxHeight: Math.min(320, below),
      });
    }
  }, [align, options.length]);

  useLayoutEffect(() => {
    if (open) {
      place();
    }
  }, [open, place]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !listRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    const onScroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // keep the highlighted option in view while arrowing through a long list
  useEffect(() => {
    if (open && active >= 0) {
      document
        .getElementById(`${uid}-opt-${active}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active, uid]);

  const openList = () => {
    if (disabled) {
      return;
    }
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabled());
    setOpen(true);
  };

  const commit = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) {
      return;
    }
    setOpen(false);
    if (o.value !== value) {
      onChange(o.value);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (k) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => step(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => step(i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActive(firstEnabled());
        break;
      case "End":
        e.preventDefault();
        setActive(lastEnabled());
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Escape":
        // keep an enclosing dialog open: only the menu closes
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          window.clearTimeout(typed.current.timer);
          typed.current.text += k.toLowerCase();
          typed.current.timer = window.setTimeout(() => {
            typed.current.text = "";
          }, 600);
          const hit = options.findIndex(
            (o, i) =>
              isEnabled(i) &&
              o.label.toLowerCase().startsWith(typed.current.text),
          );
          if (hit >= 0) {
            setActive(hit);
          }
        }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && active >= 0 ? `${uid}-opt-${active}` : undefined
        }
        aria-label={ariaLabel}
        data-value={value}
        disabled={disabled}
        className={`ui-select ui-select--${size}${
          block ? " ui-select--block" : ""
        }${open ? " is-open" : ""} ${className}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span
          className={`ui-select__value${selected ? "" : " is-placeholder"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <Icon name="chevronsUpDown" size={14} className="ui-select__chev" />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="ui-select__list"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${uid}-opt-${i}`}
                role="option"
                data-value={o.value}
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                data-active={i === active || undefined}
                className="ui-select__opt"
                // keep focus on the trigger so the keyboard keeps working
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => isEnabled(i) && setActive(i)}
                onClick={() => commit(i)}
              >
                <span className="ui-select__check">
                  {o.value === value && <Icon name="check" size={14} />}
                </span>
                <span className="ui-select__text">
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
};
