import { productShots } from "@/assets/product/shots";
import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { ProductFrame, ScreenshotReveal } from "@/components/motion/ScreenshotReveal";
import { SectionLabel } from "@/pages/landing/components/GrainField";

const STREAM = [
  "Новая вакансия Head of Sales",
  "Смена директора",
  "Новый тендер",
  "Упоминание в отраслевом медиа",
  "Growth signal",
];

export function SignalsStory() {
  return (
    <PinnedStory steps={4} className="bg-[#0C0032] px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto grid w-full max-w-[1440px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <StepItem show={step >= 0}>
              <SectionLabel>06 / Signals</SectionLabel>
            </StepItem>
            <StepItem show={step >= 0}>
              <h2 className="mt-4 max-w-[12ch] text-[clamp(2.2rem,4.2vw,4.2rem)] leading-[1.02] tracking-[-0.045em]">
                Рынок изменился. Вы уже знаете.
              </h2>
            </StepItem>
            <div className="mt-10 overflow-hidden border-t border-line">
              {STREAM.map((item, index) =>
                step >= 1 + Math.floor(index / 2) ? (
                  <StepItem key={item} show>
                    <div className="flex items-center gap-3 border-b border-line py-3 text-[14px]">
                      <span className="size-1.5 rounded-full bg-[#967CFF]" />
                      <span>{item}</span>
                    </div>
                  </StepItem>
                ) : null,
              )}
            </div>
          </div>
          <ScreenshotReveal active={step >= 1}>
            <ProductFrame
              src={productShots.signals}
              alt="Экран сигналов с вакансиями, сменой директора и intent-событиями по компаниям"
              className="max-h-[52svh] object-[12%_12%]"
            />
          </ScreenshotReveal>
        </div>
      )}
    </PinnedStory>
  );
}
