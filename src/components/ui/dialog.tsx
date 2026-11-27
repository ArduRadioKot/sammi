import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(27,27,26,0.28)]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[min(560px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-line bg-surface-0 p-4 shadow-[var(--shadow-float)]",
          className,
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <DialogPrimitive.Title className="text-[15px] font-medium">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {title}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-1">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  width = 460,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(27,27,26,0.18)]" />
        <DialogPrimitive.Content
          className="fixed top-0 right-0 z-50 flex h-dvh flex-col border-l border-line bg-surface-0 shadow-[var(--shadow-float)]"
          style={{ width: `min(${width}px, 100%)` }}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <div>
              <DialogPrimitive.Title className="text-[14px] font-medium">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-1">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
