import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-8 w-full items-center justify-between rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-3.5 text-ink-muted" />
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" sideOffset={5} className="z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-0 text-ink shadow-[var(--shadow-float)]">
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  children,
  value,
}: {
  children: React.ReactNode;
  value: string;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-xs)] px-3 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-1 data-[state=checked]:font-medium"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn("flex gap-1 border-b border-line", className)}
    {...props}
  />
);
export const TabsTrigger = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "h-8 px-2.5 text-[13px] text-ink-muted data-[state=active]:border-b data-[state=active]:border-ink data-[state=active]:text-ink",
      className,
    )}
    {...props}
  />
);
export const TabsContent = TabsPrimitive.Content;
