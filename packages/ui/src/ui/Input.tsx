import { type KeyboardEvent, useEffect, useRef, useState } from "react";

interface Props {
  placeholder?: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit(value: string): void;
  onCancel?(): void;
}

/** One-line input that submits on Enter and cancels on Escape. */
export function Input({ placeholder, initial = "", autoFocus = true, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      onSubmit(value.trim());
      setValue("");
    } else if (e.key === "Escape") onCancel?.();
  };
  return (
    <input
      ref={ref}
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => onCancel?.()}
    />
  );
}
