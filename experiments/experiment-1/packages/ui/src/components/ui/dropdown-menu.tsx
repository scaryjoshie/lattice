import * as Primitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          "pop z-50 min-w-[160px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-md",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof Primitive.Item> & { destructive?: boolean }) {
  return (
    <Primitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0",
        destructive && "text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn(
        "px-2 py-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator(props: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className="-mx-1 my-1 h-px bg-border" {...props} />;
}
