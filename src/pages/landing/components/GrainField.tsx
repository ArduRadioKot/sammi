import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function GrainField({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduce) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        root.classList.toggle("is-paused", !entry?.isIntersecting);
      },
      { rootMargin: "80px" },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [reduce]);

  return (
    <div ref={rootRef} className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className={cn("landing-orb landing-orb-a", reduce && "motion-paused")}
        aria-hidden
      />
      <div
        className={cn("landing-orb landing-orb-b", reduce && "motion-paused")}
        aria-hidden
      />
      <div className="landing-grain absolute inset-0" />
    </div>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] tracking-[0.18em] text-ink-faint uppercase">{children}</p>
  );
}
