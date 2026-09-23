import { productShots } from "@/assets/product/shots";
import { DrawLine } from "@/components/motion/DrawLine";
import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { ProductFrame, ScreenshotReveal } from "@/components/motion/ScreenshotReveal";
import { SectionLabel } from "@/pages/landing/components/GrainField";

const DESTINATIONS = ["amoCRM", "Bitrix24", "Telegram", "Webhook"];

export function ActivationStory() {
  return (
    <PinnedStory steps={3} className="bg-[#06100E] px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto grid w-full max-w-[1440px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <StepItem show={step >= 0}>
              <SectionLabel>08 / Activation</SectionLabel>
            </StepItem>
            <StepItem show={step >= 0}>
              <h2 className="mt-4 max-w-[14ch] text-[clamp(2.2rem,4.2vw,4.2rem)] leading-[1.02] tracking-[-0.045em]">
                Сигнал не должен ждать человека.
              </h2>
            </StepItem>
            <StepItem show={step >= 1}>
              <p className="mt-4 max-w-md text-[15px] text-ink-muted">
                Qualified record уходит в CRM, мессенджер или webhook без ручной выгрузки.
              </p>
            </StepItem>
            <StepItem show={step >= 1}>
              <svg viewBox="0 0 360 220" className="mt-8 w-full max-w-md text-[rgba(247,245,239,0.6)]">
                <DrawLine d="M80 110 H280" active={step >= 1} />
                <circle cx="80" cy="110" r="5" fill="#E9D2A3" />
                <text x="24" y="96" fontSize="11" fill="currentColor">
                  Qualified record
                </text>
                {DESTINATIONS.map((item, index) => (
                  <text key={item} x="292" y={46 + index * 42} fontSize="12" fill="currentColor">
                    {item}
                  </text>
                ))}
              </svg>
            </StepItem>
          </div>
          <ScreenshotReveal active={step >= 1}>
            <ProductFrame
              src={productShots.integrations}
              alt="Экран интеграций с контурами данных, AI, CRM и каналами активации"
              className="max-h-[52svh] object-[10%_8%]"
            />
          </ScreenshotReveal>
        </div>
      )}
    </PinnedStory>
  );
}
