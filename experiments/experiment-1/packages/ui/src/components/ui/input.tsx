import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-8 w-full rounded-sm border border-border bg-surface px-2.5 text-[13px] text-text placeholder:text-muted transition-colors focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
