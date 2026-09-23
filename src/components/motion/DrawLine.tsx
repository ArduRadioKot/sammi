import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/lib/motion/tokens";

export function DrawLine({
  d,
  className,
  delay = 0,
  active,
}: {
  d: string;
  className?: string;
  delay?: number;
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  const gated = active !== undefined;
  const shown = reduce || (gated ? active : true);
  return (
    <motion.path
      d={d}
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1"
      initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
      animate={gated ? { pathLength: shown ? 1 : 0, opacity: shown ? 1 : 0.4 } : undefined}
      whileInView={gated ? undefined : { pathLength: 1, opacity: 1 }}
      viewport={gated ? undefined : { once: true, amount: 0.4 }}
      transition={{
        duration: motionTokens.duration.cinematic,
        delay: gated ? 0 : delay + 0.16,
        ease: motionTokens.ease.smooth,
      }}
    />
  );
}
