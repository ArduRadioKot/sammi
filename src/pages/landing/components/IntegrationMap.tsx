import { DrawLine } from "@/components/motion/DrawLine";
import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { APP_NAME } from "@/lib/constants/config";

const RINGS = [
  { title: "DATA", items: ["DaData", "Kontur", "HH", "ЕГРЮЛ"] },
  { title: "AI", items: ["GigaChat", "Yandex", "Ollama"] },
  { title: "CRM", items: ["amoCRM", "Bitrix24"] },
  { title: "ACTION", items: ["Telegram", "Webhook"] },
];

export function IntegrationMap() {
  return (
    <PinnedStory steps={3} className="bg-[#0C0032] px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto w-full max-w-[1440px]">
          <StepItem show={step >= 0}>
            <p className="ds-label text-ink-faint">09 / Topology</p>
          </StepItem>
          <StepItem show={step >= 0}>
            <h2 className="mt-4 max-w-[14ch] text-[clamp(2.2rem,4vw,4rem)] tracking-[-0.045em]">
              Платформа в центре. Источники по кольцу.
            </h2>
          </StepItem>
          <div className="relative mt-12 grid gap-8 lg:grid-cols-[1fr_220px_1fr] lg:items-center">
            <div className="space-y-6">
              {RINGS.slice(0, 2).map((ring) => (
                <StepItem key={ring.title} className="border-t border-line pt-4" show={step >= 1}>
                  <div className="ds-label text-ink-faint">{ring.title}</div>
                  <div className="mt-2 text-[15px]">{ring.items.join(" · ")}</div>
                </StepItem>
              ))}
            </div>
            <StepItem show={step >= 1} className="relative grid place-items-center py-10">
              <svg viewBox="0 0 220 220" className="absolute inset-0 h-full w-full text-[rgba(247,245,239,0.28)]">
                <DrawLine d="M110 18 L110 202" active={step >= 1} />
                <DrawLine d="M18 110 H202" active={step >= 2} />
              </svg>
              <div className="relative z-10 text-center text-[13px] tracking-[0.16em] uppercase">{APP_NAME}</div>
            </StepItem>
            <div className="space-y-6">
              {RINGS.slice(2).map((ring, index) => (
                <StepItem key={ring.title} className="border-t border-line pt-4" show={step >= 1 + Math.min(index, 1)}>
                  <div className="ds-label text-ink-faint">{ring.title}</div>
                  <div className="mt-2 text-[15px]">{ring.items.join(" · ")}</div>
                </StepItem>
              ))}
            </div>
          </div>
        </div>
      )}
    </PinnedStory>
  );
}
