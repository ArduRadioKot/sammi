import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { Dialog } from "@radix-ui/react-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Command = CommandPrimitive;
export const CommandInput = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) => (
  <div className="flex items-center gap-2 border-b border-line px-3">
    <Search className="size-4 text-ink-muted" />
    <CommandPrimitive.Input
      className={cn(
        "h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-ink-faint",
        className,
      )}
      {...props}
    />
  </div>
);
export const CommandList = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) => (
  <CommandPrimitive.List className={cn("max-h-80 overflow-auto p-1", className)} {...props} />
);
export const CommandEmpty = CommandPrimitive.Empty;
export const CommandGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) => (
  <CommandPrimitive.Group
    className={cn(
      "px-1 py-1 text-[11px] text-ink-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase",
      className,
    )}
    {...props}
  />
);
export const CommandItem = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) => (
  <CommandPrimitive.Item
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] text-ink data-[selected=true]:bg-surface-1",
      className,
    )}
    {...props}
  />
);

export function CommandDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(27,27,26,0.24)]" />
        <DialogPrimitive.Content className="glass-float fixed top-[18%] left-1/2 z-50 w-[min(560px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)]">
          <DialogPrimitive.Title className="sr-only">Команды</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Поиск по таблицам, компаниям и командам
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
