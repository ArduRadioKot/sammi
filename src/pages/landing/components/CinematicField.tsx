import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { GrainField } from "@/pages/landing/components/GrainField";

const MARKS = [
  "kontur.ru",
  "yandex.cloud",
  "inn 7701234567",
  "score 92",
  "intent high",
  "hh.ru/vacancy",
  "signal:director",
  "dadata → skipped",
];

export function CinematicField() {
  return (
    <PinnedStory steps={4} className="relative overflow-hidden bg-[#06100E] px-5 lg:px-10">
      {(step) => (
        <>
          <GrainField />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(242,176,128,0.08),transparent)]" />
          <div className="relative mx-auto w-full max-w-[1440px]">
            <StepItem show={step >= 0}>
              <p className="ds-label text-ink-faint">03 / Field</p>
            </StepItem>
            <StepItem show={step >= 0}>
              <h2 className="mt-8 max-w-[10ch] text-[clamp(3.4rem,9vw,9.5rem)] leading-[0.86] font-medium tracking-[-0.06em]">
                Поле данных
                <span className="mt-2 block font-serif text-[0.72em] italic text-[#F7F3E8]/80">становится системой.</span>
              </h2>
            </StepItem>
            <div className="mt-16 grid max-w-xl grid-cols-2 gap-x-8 gap-y-2 font-mono-data text-[11px] text-ink-faint">
              {MARKS.map((mark, index) => (
                <StepItem key={mark} show={step >= 1 + Math.floor(index / 3)}>
                  {mark}
                </StepItem>
              ))}
            </div>
          </div>
        </>
      )}
    </PinnedStory>
  );
}
