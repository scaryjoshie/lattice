import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-px text-[11px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      tone: {
        default: "border-border bg-surface-2 text-muted",
        ok: "border-ok/40 text-ok bg-ok/10",
        warn: "border-warn/40 text-warn bg-warn/10",
        danger: "border-danger/40 text-danger bg-danger/10",
        accent: "border-accent/40 text-accent bg-accent-soft",
        count: "border-accent bg-accent text-white",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function statusTone(status: string): VariantProps<typeof badgeVariants>["tone"] {
  switch (status) {
    case "working":
    case "in_progress":
    case "online":
    case "busy":
    case "idle":
      return "ok";
    case "merge_ready":
    case "blocked":
    case "open":
      return "warn";
    case "merged":
    case "done":
      return "accent";
    default:
      return "default";
  }
}
