import { Link } from "react-router-dom";
import { productShots } from "@/assets/product/shots";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { ProductFrame } from "@/components/motion/ScreenshotReveal";

export function FinalCTA() {
  return (
    <>
      <section className="relative z-[2] px-5 py-28 lg:px-10">
        <div className="mx-auto grid w-full max-w-[1440px] items-end gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <Stagger>
            <StaggerItem>
              <h2 className="max-w-[10ch] text-[clamp(3rem,8vw,8rem)] leading-[0.9] tracking-[-0.055em]">
                От рынка — до действия.
              </h2>
            </StaggerItem>
          </Stagger>
          <div className="relative z-[2] overflow-hidden rounded-[var(--radius-media)]">
            <ProductFrame
              src={productShots.tableEditor}
              alt="Крупный кадр Table Editor с российскими SaaS-компаниями"
              className="max-h-[58svh] object-cover object-[8%_10%]"
            />
          </div>
        </div>
      </section>
      <section className="relative z-[2] px-5 py-24 lg:px-10">
        <div className="mx-auto max-w-[720px]">
          <Stagger>
            <StaggerItem>
              <h2 className="text-[clamp(2rem,4vw,3.4rem)] tracking-[-0.045em]">Начните с рабочего контура.</h2>
            </StaggerItem>
            <StaggerItem>
              <p className="mt-4 max-w-md text-[15px] text-ink-muted">
                Demo session без пароля. Таблица, waterfall и сигналы уже внутри.
              </p>
            </StaggerItem>
            <StaggerItem>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="inline-flex h-11 min-h-11 items-center rounded-full bg-[#F7F3E8] px-5 text-[13px] font-medium text-[#0A0D0B] hover:-translate-y-px"
              >
                Начать бесплатно
              </Link>
              <Link
                to="/login"
                className="inline-flex h-11 min-h-11 items-center rounded-full border border-[rgba(247,243,232,0.28)] px-5 text-[13px] text-[#F7F3E8]"
              >
                Запросить демо
              </Link>
            </div>
            </StaggerItem>
          </Stagger>
        </div>
      </section>
    </>
  );
}
