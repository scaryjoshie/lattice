import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../components/ui/button.tsx";
import { ScrollArea } from "../components/ui/scroll-area.tsx";
import { cn } from "../lib/utils.ts";
import { useStore } from "../store.ts";

/** The side panel's chrome: a header with a close button, a scrolling body. */
export function PanelHeader({ children }: { children: ReactNode }) {
  const setPanel = useStore((s) => s.setPanel);
  return (
    <div className="flex h-10 flex-none items-center gap-2 border-b border-border px-3">
      {children}
      <Button variant="ghost" size="icon" onClick={() => setPanel(null)} aria-label="Close">
        <X size={14} />
      </Button>
    </div>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <span className="flex-1 truncate text-[15px] font-semibold">{children}</span>;
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ScrollArea className="flex-1">
      <div className={cn("flex flex-col gap-3 px-3 py-3", className)}>{children}</div>
    </ScrollArea>
  );
}

export function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
      {children}
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="py-2 text-muted">{children}</div>;
}

export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b border-border py-2 last:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Kv({ rows }: { rows: Array<[string, ReactNode] | null | false> }) {
  return (
    <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1 text-[12px]">
      {rows
        .filter((r): r is [string, ReactNode] => Boolean(r))
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 truncate">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
