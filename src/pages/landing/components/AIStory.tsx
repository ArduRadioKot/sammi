import { motion } from "motion/react";
import { productShots } from "@/assets/product/shots";
import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { ProductFrame, ScreenshotReveal } from "@/components/motion/ScreenshotReveal";
import { SectionLabel } from "@/pages/landing/components/GrainField";

const FIELDS = [
  ["Product", "Cloud infrastructure"],
  ["Market", "Russia / CIS"],
  ["ICP", "Enterprise B2B"],
  ["Confidence", "high"],
];

export function AIStory() {
  return (
    <PinnedStory steps={4} className="landing-light px-5 lg:px-10">
      {(step) => {
        const phase = step >= 3 ? 2 : step >= 2 ? 1 : 0;
        return (
          <div className="mx-auto grid w-full max-w-[1440px] gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <ScreenshotReveal active={step >= 0}>
              <ProductFrame
                src={productShots.addColumn}
                alt="Структурированные колонки таблицы: enrichment-поля, статусы и score"
                className="max-h-[52svh] object-[82%_18%]"
              />
            </ScreenshotReveal>
            <div>
              <StepItem show={step >= 0}>
                <SectionLabel>04 / Research</SectionLabel>
              </StepItem>
              <StepItem show={step >= 0}>
                <h2 className="mt-4 max-w-[12ch] text-[clamp(2.2rem,4.2vw,4.2rem)] leading-[1.02] tracking-[-0.045em]">
                  Research становится колонкой.
                </h2>
              </StepItem>
              <StepItem show={step >= 1}>
                <p className="mt-4 max-w-md text-[15px] text-ink-muted">
                  Модель не пишет абзац. Она возвращает продукт, рынок, ICP и уверенность — прямо в строку.
                </p>
              </StepItem>
              <StepItem show={step >= 1}>
                <div className="mt-8 text-[12px] tracking-[0.1em] text-ink-faint uppercase">
                  {phase === 0 ? "Prompt" : phase === 1 ? "Running" : "Structured result"}
                </div>
              </StepItem>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {FIELDS.map(([label, value], index) => (
                  <motion.div
                    key={label}
                    className="border-t border-line pt-3"
                    initial={false}
                    animate={{ opacity: step >= 2 ? 1 : 0.28 }}
                    transition={{ duration: 0.7, delay: step >= 2 ? index * 0.08 : 0, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="text-[11px] text-ink-faint">{label}</div>
                    <div className="mt-1 text-[14px]">{step >= 2 ? value : "—"}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </PinnedStory>
  );
}
