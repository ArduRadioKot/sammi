import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { SectionLabel } from "@/pages/landing/components/GrainField";

const AVAILABLE = [
  "Клиентская session isolation",
  "Роли в интерфейсе workspace",
  "Архитектурное направление под 152-ФЗ",
];

const ROADMAP = [
  "Хранение данных в РФ",
  "RBAC и audit log на сервере",
  "Private cloud",
  "On-premise",
];

export function SecuritySection() {
  return (
    <PinnedStory steps={4} className="bg-[#0C0032] px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto w-full max-w-[920px]">
          <StepItem show={step >= 0}>
            <SectionLabel>10 / Infrastructure</SectionLabel>
          </StepItem>
          <StepItem show={step >= 0}>
            <h2 className="mt-4 max-w-[14ch] text-[clamp(2.2rem,4vw,4rem)] leading-[1.02] tracking-[-0.045em]">
              Российский контур. Без лишних обещаний.
            </h2>
          </StepItem>
          <div className="mt-14 grid gap-10 md:grid-cols-2">
            <div>
              <StepItem show={step >= 1}>
                <div className="ds-label text-[#967CFF]">Available</div>
              </StepItem>
              <div className="mt-4 divide-y divide-line border-y border-line">
                {AVAILABLE.map((item, index) => (
                  <StepItem key={item} className="py-3 text-[15px]" show={step >= 1 + Math.min(index, 1)}>
                    {item}
                  </StepItem>
                ))}
              </div>
            </div>
            <div>
              <StepItem show={step >= 2}>
                <div className="ds-label text-ink-faint">Roadmap</div>
              </StepItem>
              <div className="mt-4 divide-y divide-line border-y border-line">
                {ROADMAP.map((item, index) => (
                  <StepItem key={item} className="py-3 text-[15px] text-ink-muted" show={step >= 2 + Math.min(index, 1)}>
                    {item}
                  </StepItem>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </PinnedStory>
  );
}
