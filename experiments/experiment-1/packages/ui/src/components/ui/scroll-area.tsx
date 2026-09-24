import * as Primitive from "@radix-ui/react-scroll-area";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

export function ScrollArea({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root className={cn("relative min-h-0 overflow-hidden", className)} {...props}>
      <Primitive.Viewport className="h-full w-full [&>div]:!block">{children}</Primitive.Viewport>
      <Primitive.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none select-none p-px transition-colors"
      >
        <Primitive.Thumb className="relative flex-1 rounded-full bg-border" />
      </Primitive.Scrollbar>
    </Primitive.Root>
  );
}
