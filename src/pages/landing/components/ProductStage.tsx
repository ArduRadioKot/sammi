import { productShots } from "@/assets/product/shots";
import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { ProductFrame, ScreenshotReveal } from "@/components/motion/ScreenshotReveal";
import { SectionLabel } from "@/pages/landing/components/GrainField";

export function ProductStage() {
  return (
    <PinnedStory id="workspace" steps={2} className="bg-[#0C0032] px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto w-full max-w-[1440px]">
          <StepItem show={step >= 0}>
            <SectionLabel>THE WORKSPACE</SectionLabel>
          </StepItem>
          <StepItem show={step >= 0}>
            <h2 className="mt-4 max-w-[14ch] text-[clamp(2.2rem,4.4vw,4.4rem)] leading-[1.02] tracking-[-0.045em]">
              Работайте с рынком как с таблицей.
            </h2>
          </StepItem>
          <div className="relative z-[2] mt-8">
            <ScreenshotReveal className="w-[min(92vw,1100px)]" active={step >= 1}>
              <ProductFrame
                src={productShots.tableEditor}
                alt="Таблица российских SaaS-компаний с колонками enrichment, AI Research, Intent и Score"
                className="max-h-[52svh] object-[8%_16%]"
              />
            </ScreenshotReveal>
          </div>
        </div>
      )}
    </PinnedStory>
  );
}

export function ProductProofMobile() {
  return (
    <section className="relative z-[2] px-5 py-8 lg:hidden">
      <div className="space-y-3 text-[12px] tracking-[0.12em] text-ink-faint uppercase">
        <div>Enrichment</div>
        <div>AI Research</div>
        <div>Signals</div>
      </div>
    </section>
  );
}
