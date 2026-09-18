import * as Primitive from "@radix-ui/react-context-menu";
import { ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

export const ContextMenu = Primitive.Root;
export const ContextMenuTrigger = Primitive.Trigger;
export const ContextMenuSub = Primitive.Sub;

const panel =
  "pop z-50 min-w-[160px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-md";
const item =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0";

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content className={cn(panel, className)} {...props} />
    </Primitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof Primitive.Item> & { destructive?: boolean }) {
  return (
    <Primitive.Item className={cn(item, destructive && "text-danger", className)} {...props} />
  );
}

export function ContextMenuSeparator(props: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className="-mx-1 my-1 h-px bg-border" {...props} />;
}

export function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.SubTrigger>) {
  return (
    <Primitive.SubTrigger
      className={cn(item, "data-[state=open]:bg-surface-2", className)}
      {...props}
    >
      {children}
      <ChevronRight size={12} className="ml-auto text-muted" />
    </Primitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.Portal>
      <Primitive.SubContent className={cn(panel, className)} {...props} />
    </Primitive.Portal>
  );
}
