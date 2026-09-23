import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionTokens } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export function PinnedStory({
  steps,
  children,
  className,
  hold = 0.14,
  id,
}: {
  steps: number;
  children: (step: number) => ReactNode;
  className?: string;
  hold?: number;
  id?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const last = Math.max(0, steps - 1);
  const [step, setStep] = useState(reduce ? last : 0);

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      if (total <= 0) {
        setStep(0);
        return;
      }
      const progress = Math.min(1, Math.max(0, -rect.top / total));
      const eased = Math.min(1, progress / 0.36);
      setStep((current) => {
        const next = Math.min(last, Math.max(0, Math.floor(eased * steps)));
        return current === next ? current : next;
      });
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [last, reduce, steps]);

  if (reduce) {
    return (
      <div id={id} className={className}>
        {children(last)}
      </div>
    );
  }

  return (
    <div ref={ref} id={id} style={{ height: `${(1 + last * hold) * 100}svh` }}>
      <div
        data-step={step}
        className={cn("sticky top-0 z-[2] flex min-h-svh flex-col justify-center overflow-hidden", className)}
      >
        {children(step)}
      </div>
    </div>
  );
}

export function StepItem({
  show,
  children,
  className,
  as = "div",
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
  as?: "div" | "span";
}) {
  const reduce = useReducedMotion();
  const Component = as === "span" ? motion.span : motion.div;

  if (reduce) {
    return <Component className={className}>{children}</Component>;
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
      transition={{ duration: motionTokens.duration.slow, ease: motionTokens.ease.smooth }}
    >
      {children}
    </Component>
  );
}
