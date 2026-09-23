import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";

const FACTS = [
  { value: "180", label: "строк в демо-таблице российских SaaS" },
  { value: "3", label: "режима AI: GigaChat, Yandex, Ollama" },
  { value: "5", label: "шагов контура: данные → сигнал → действие" },
];

export function ProofStrip() {
  return (
    <PinnedStory steps={3} className="landing-light border-t border-line px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto w-full max-w-[1440px]">
          <StepItem show={step >= 0}>
            <p className="ds-label text-ink-faint">05 / Proof</p>
          </StepItem>
          <StepItem show={step >= 0}>
            <h2 className="mt-4 max-w-[18ch] text-[clamp(1.8rem,3vw,2.8rem)] tracking-[-0.04em]">
              Только то, что уже есть в прототипе.
            </h2>
          </StepItem>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {FACTS.map((fact, index) => (
              <StepItem key={fact.value} className="border-t border-line pt-6" show={step >= 1 + Math.min(index, 1)}>
                <div className="text-[clamp(3rem,6vw,5.5rem)] leading-none tracking-[-0.06em]">{fact.value}</div>
                <p className="mt-4 max-w-[22ch] text-[14px] text-ink-muted">{fact.label}</p>
              </StepItem>
            ))}
          </div>
        </div>
      )}
    </PinnedStory>
  );
}
