import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-16 w-full resize-y rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[13px] text-text placeholder:text-muted transition-colors focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
