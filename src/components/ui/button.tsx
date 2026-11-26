import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] text-[13px] font-medium transition-[transform,background-color,opacity,border-color] duration-[var(--motion-ui)] ease-[var(--ease-out)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:-translate-y-px active:translate-y-0",
        secondary:
          "border border-line bg-transparent text-ink hover:bg-surface-1",
        ghost: "text-ink-muted hover:bg-surface-1 hover:text-ink",
        accent:
          "bg-accent text-accent-foreground hover:-translate-y-px active:translate-y-0",
        ivory:
          "rounded-full bg-[#F6F5F8] text-[#0C0032] hover:-translate-y-px",
        outline:
          "rounded-full border border-[rgba(246,245,248,0.28)] bg-transparent text-[#F6F5F8] hover:border-[rgba(246,245,248,0.5)]",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 px-2.5",
        md: "h-9 px-3",
        lg: "h-11 min-h-11 px-5",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : type}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
