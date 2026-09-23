import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { motionTokens } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export function ScreenshotReveal({
  children,
  className,
  delay = 0.28,
  active,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(!reduce);
  const gated = active !== undefined;
  const shown = reduce || (gated ? active : true);

  return (
    <div className={cn("relative z-[2] overflow-hidden rounded-[var(--radius-media)]", className)}>
      <motion.div
        className="h-full w-full [backface-visibility:hidden]"
        initial={reduce ? false : { scale: 1.018, opacity: 0 }}
        animate={gated ? { scale: shown ? 1 : 1.018, opacity: shown ? 1 : 0 } : undefined}
        whileInView={gated ? undefined : { scale: 1, opacity: 1 }}
        viewport={gated ? undefined : { once: true, amount: 0.28, margin: "0px 0px -8% 0px" }}
        transition={{
          duration: motionTokens.duration.cinematic,
          delay: gated ? 0 : delay,
          ease: motionTokens.ease.smooth,
        }}
        style={{ willChange: busy ? "transform, opacity" : "auto" }}
        onAnimationComplete={() => setBusy(false)}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function ProductFrame({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      width={1440}
      height={900}
      className={cn("relative z-[2] block h-auto w-full object-cover object-top", className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "low"}
      draggable={false}
    />
  );
}
