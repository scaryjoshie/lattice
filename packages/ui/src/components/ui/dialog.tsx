import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fade fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "pop fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface shadow-lg focus:outline-none",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <DialogPrimitive.Title className="flex-1 text-[15px] font-semibold">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
            <X size={14} />
          </DialogPrimitive.Close>
        </div>
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 px-4 py-3", className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
      {children}
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
        {label}
      </span>
      {children}
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}
