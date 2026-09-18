import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button.tsx";

export interface MenuField {
  key: string;
  placeholder: string;
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick?(): void;
  children?: MenuItem[];
  /** Clicking turns the row into a small form; submit calls `onSubmit`. */
  form?: { fields: MenuField[]; onSubmit(values: Record<string, string>): void };
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

function Item({ item, close }: { item: MenuItem; close(): void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) first.current?.focus();
  }, [open]);
  if (item.form && open) {
    const f = item.form;
    const submit = () => {
      if (f.fields.some((x) => !values[x.key]?.trim())) return;
      f.onSubmit(values);
      close();
    };
    return (
      <div className="inline-form">
        {f.fields.map((field, i) => (
          <input
            key={field.key}
            ref={i === 0 ? first : undefined}
            placeholder={field.placeholder}
            value={values[field.key] ?? ""}
            onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") close();
            }}
          />
        ))}
        <div className="form">
          <Button size="sm" variant="primary" onClick={submit}>
            {item.label}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`mi${item.danger ? " danger" : ""}`}
        onClick={() => {
          if (item.children || item.form) setOpen(!open);
          else {
            item.onClick?.();
            close();
          }
        }}
      >
        {item.icon}
        <span className="grow">{item.label}</span>
        {item.children && <span className="muted">›</span>}
      </button>
      {item.children && open && (
        <div className="sub">
          {item.children.map((c) => (
            <Item key={c.label} item={c} close={close} />
          ))}
        </div>
      )}
    </>
  );
}

export function ContextMenu({ menu, close }: { menu: MenuState; close(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);
  const x = Math.min(menu.x, window.innerWidth - 200);
  const y = Math.min(menu.y, window.innerHeight - 200);
  return (
    <motion.div
      ref={ref}
      className="menu"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.12 }}
    >
      {menu.items.map((item) => (
        <Item key={item.label} item={item} close={close} />
      ))}
    </motion.div>
  );
}
