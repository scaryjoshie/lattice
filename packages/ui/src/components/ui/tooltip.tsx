import * as Primitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = Primitive.Provider;

/** Wrap any element; the label shows after a short delay. */
export function Tip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side={side}
          sideOffset={6}
          className="pop z-50 rounded-sm border border-border bg-surface px-2 py-1 text-[12px] text-text shadow-md"
        >
          {label}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
