import * as Primitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

export const Tabs = Primitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      className={cn("flex items-end gap-0 overflow-x-auto border-b border-border px-2", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        "-mb-px shrink-0 cursor-pointer border-b-2 border-transparent px-1.5 py-2 text-[12px] text-muted transition-colors hover:text-text focus-visible:outline-none data-[state=active]:border-accent data-[state=active]:text-text",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={cn("flex min-h-0 flex-1 flex-col focus-visible:outline-none", className)}
      {...props}
    />
  );
}
