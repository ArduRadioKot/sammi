import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const LEFT = [
  { label: "Company", value: "Yandex Cloud" },
  { label: "Domain", value: "yandex.cloud" },
  { label: "ИНН", value: "7701234567" },
];

const PIPE = ["DaData", "Контур", "ЕГРЮЛ", "AI Research", "Signals"];

const RIGHT = [
  { label: "Score", value: "92" },
  { label: "Intent", value: "High" },
  { label: "Decision Maker", value: "Found" },
  { label: "CRM", value: "Ready" },
];

export function HeroDataScene({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion();

  if (compact) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface-1/40 p-4">
        <div className="text-[12px] text-ink-faint">Company → Enrichment → Score</div>
        <div className="mt-3 space-y-2 text-[13px]">
          <div>Yandex Cloud · 7701234567</div>
          <div className="text-ink-muted">DaData · Контур · ЕГРЮЛ</div>
          <div className="font-medium">Score 92 · Intent High · CRM Ready</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid grid-cols-[0.9fr_1.2fr_0.9fr] items-center gap-3">
      <div className="space-y-2">
        {LEFT.map((item, index) => (
          <motion.div
            key={item.label}
            className="rounded-[var(--radius-md)] border border-line bg-surface-1/50 px-3 py-2"
            initial={reduce ? false : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 + index * 0.08, duration: 0.48 }}
          >
            <div className="text-[10px] tracking-[0.12em] text-ink-faint uppercase">{item.label}</div>
            <div className={cn("mt-1 text-[13px]", item.label === "ИНН" && "font-mono-data")}>{item.value}</div>
          </motion.div>
        ))}
      </div>
      <div className="relative px-2">
        <svg viewBox="0 0 220 220" className="h-auto w-full text-[rgba(231,238,234,0.28)]" aria-hidden>
          <motion.path
            d="M8 40 H90 V110 H212"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, delay: 0.6 }}
          />
          <motion.path
            d="M8 110 H212"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, delay: 0.7 }}
          />
          <motion.path
            d="M8 180 H90 V110 H212"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, delay: 0.8 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col justify-center gap-2 px-6">
          {PIPE.map((name, index) => (
            <motion.div
              key={name}
              className="rounded-full border border-line bg-[#101a17]/80 px-3 py-1 text-center text-[11px] tracking-[0.08em] uppercase"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + index * 0.07, duration: 0.4 }}
            >
              {name}
            </motion.div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {RIGHT.map((item, index) => (
          <motion.div
            key={item.label}
            className="rounded-[var(--radius-md)] border border-line bg-surface-1/50 px-3 py-2"
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.85 + index * 0.08, duration: 0.48 }}
          >
            <div className="text-[10px] tracking-[0.12em] text-ink-faint uppercase">{item.label}</div>
            <div className="mt-1 text-[13px] font-medium">{item.value}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
