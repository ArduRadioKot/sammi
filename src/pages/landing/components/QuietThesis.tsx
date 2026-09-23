import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";

const LINES = ["Один рынок.", "Сотни источников.", "Одна рабочая система."];

export function QuietThesis() {
  return (
    <PinnedStory steps={3} className="bg-[#06100E] px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto w-full max-w-[920px]">
          <StepItem show={step >= 0}>
            <p className="ds-label text-ink-faint">01 / Thesis</p>
          </StepItem>
          <h2 className="mt-8 max-w-[16ch] text-[clamp(2.4rem,5vw,4.8rem)] leading-[1.02] font-medium tracking-[-0.045em]">
            {LINES.map((line, index) => (
              <StepItem key={line} as="span" className="block" show={step >= index}>
                {line}
              </StepItem>
            ))}
          </h2>
        </div>
      )}
    </PinnedStory>
  );
}
