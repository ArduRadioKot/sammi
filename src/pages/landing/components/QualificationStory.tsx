import { productShots } from "@/assets/product/shots";
import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { ProductFrame, ScreenshotReveal } from "@/components/motion/ScreenshotReveal";
import { SectionLabel } from "@/pages/landing/components/GrainField";

const FILTERS = ["Employees > 100", "Score > 80", "Intent = High"];

export function QualificationStory() {
  return (
    <PinnedStory steps={2} className="bg-[#0C0032] px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto w-full max-w-[1440px]">
          <StepItem show={step >= 0}>
            <SectionLabel>07 / Qualification</SectionLabel>
          </StepItem>
          <StepItem show={step >= 0}>
            <h2 className="mt-4 max-w-[16ch] text-[clamp(2.2rem,4.2vw,4.2rem)] leading-[1.02] tracking-[-0.045em]">
              Сотни строк сжимаются до нескольких верных.
            </h2>
          </StepItem>
          <StepItem show={step >= 1}>
            <div className="mt-4 flex flex-wrap gap-4 font-mono-data text-[12px] text-ink-faint">
              {FILTERS.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </StepItem>
          <div className="relative z-[2] mt-10">
            <ScreenshotReveal active={step >= 1}>
              <ProductFrame
                src={productShots.tableEditor}
                alt="Таблица после фильтрации: остаются только квалифицированные строки"
                className="max-h-[52svh] object-[20%_0]"
              />
            </ScreenshotReveal>
          </div>
        </div>
      )}
    </PinnedStory>
  );
}
