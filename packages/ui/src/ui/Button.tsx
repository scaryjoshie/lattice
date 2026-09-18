import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
}

export function Button({ variant = "default", size = "md", className = "", ...rest }: Props) {
  const cls = ["btn", variant !== "default" ? variant : "", size === "sm" ? "sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button type="button" className={cls} {...rest} />;
}
