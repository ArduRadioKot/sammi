import { productShots } from "@/assets/product/shots";
import { DrawLine } from "@/components/motion/DrawLine";
import { PinnedStory, StepItem } from "@/components/motion/PinnedStory";
import { ProductFrame, ScreenshotReveal } from "@/components/motion/ScreenshotReveal";
import { SectionLabel } from "@/pages/landing/components/GrainField";

const NODES = [
  { name: "INPUT COMPANY", status: "ready" },
  { name: "DaData", status: "not_found" },
  { name: "Kontur", status: "found" },
  { name: "VERIFIED", status: "verified" },
] as const;

export function WaterfallStory() {
  return (
    <PinnedStory steps={4} className="bg-[#06100E] px-5 lg:px-10">
      {(step) => (
        <div className="mx-auto grid w-full max-w-[1440px] gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div>
            <StepItem show={step >= 0}>
              <SectionLabel>02 / Waterfall</SectionLabel>
            </StepItem>
            <StepItem show={step >= 0}>
              <h2 className="mt-4 max-w-[12ch] text-[clamp(2.2rem,4.2vw,4.2rem)] leading-[1.02] tracking-[-0.045em]">
                Не один источник. Система источников.
              </h2>
            </StepItem>
            <StepItem show={step >= 1}>
              <p className="mt-5 max-w-md text-[15px] text-ink-muted">
                Цепочка идёт сверху вниз. Первый валидный результат останавливает поиск. Остальные источники — skipped.
              </p>
            </StepItem>
            <StepItem show={step >= 1}>
              <svg viewBox="0 0 280 280" className="mt-8 h-[200px] w-[200px] text-[rgba(247,245,239,0.55)]">
                <DrawLine d="M140 18 L140 262" active={step >= 1} />
                {NODES.map((node, index) => {
                  const y = 28 + index * 72;
                  const active = step >= 1 + Math.min(index, 2);
                  const found = node.status === "found" || node.status === "verified";
                  return (
                    <g key={node.name} opacity={active ? 1 : 0.28}>
                      <circle cx="140" cy={y} r="4" fill={found && active ? "#CDEFB2" : "currentColor"} />
                      <text x="158" y={y + 4} fontSize="11" fill="currentColor">
                        {node.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div className="mt-2 space-y-1 font-mono-data text-[11px] text-ink-faint">
                <div>DaData · {step >= 2 ? "NOT FOUND" : "SEARCHING"}</div>
                <div>Kontur · {step >= 3 ? "FOUND" : step >= 2 ? "SEARCHING" : "WAIT"}</div>
                <div>Remaining · {step >= 3 ? "SKIPPED" : "—"}</div>
              </div>
            </StepItem>
          </div>
          <ScreenshotReveal active={step >= 1}>
            <ProductFrame
              src={productShots.enrichment}
              alt="Enrichment-колонка с DaData: конфигурация источника и статусы поиска"
              className="max-h-[52svh] object-[70%_20%]"
            />
          </ScreenshotReveal>
        </div>
      )}
    </PinnedStory>
  );
}
