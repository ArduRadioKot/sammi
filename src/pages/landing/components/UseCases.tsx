import { useState } from "react";
import { productShots } from "@/assets/product/shots";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { ProductFrame } from "@/components/motion/ScreenshotReveal";

const CASES = [
  {
    id: "01",
    title: "Outbound",
    body: "От списка доменов — к ЛПР и готовой последовательности.",
    src: productShots.tableEditor,
    alt: "Таблица компаний для outbound: enrichment, контакты и score в одной сетке",
  },
  {
    id: "02",
    title: "Account Research",
    body: "AI собирает продукт, рынок и enterprise-признаки.",
    src: productShots.aiColumn,
    alt: "AI Column с исследованием продукта, рынка и ICP компании",
  },
  {
    id: "03",
    title: "Signal Selling",
    body: "Вакансии, смена директора и тендеры запускают workflow.",
    src: productShots.signals,
    alt: "Лента рыночных сигналов для запуска продаж по событию",
  },
  {
    id: "04",
    title: "Enrichment",
    body: "Waterfall по российским источникам до verified result.",
    src: productShots.waterfall,
    alt: "Waterfall-цепочка провайдеров DaData и Контур",
  },
  {
    id: "05",
    title: "Market Intelligence",
    body: "Один workspace вместо десяти выгрузок.",
    src: productShots.audiences,
    alt: "Сегменты аудиторий, собранные из таблицы рынка и сигналов",
  },
] as const;

export function UseCases() {
  const [active, setActive] = useState(0);

  return (
    <section className="relative z-[2] px-5 py-24 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <Stagger>
          <StaggerItem>
            <p className="ds-label text-ink-faint">11 / Use cases</p>
          </StaggerItem>
          <StaggerItem>
            <h2 className="mt-4 text-[clamp(2.2rem,4vw,4rem)] tracking-[-0.045em]">Как этим пользуются.</h2>
          </StaggerItem>
        </Stagger>
        <div className="mt-12 grid gap-10 lg:grid-cols-[0.78fr_1.22fr]">
          <Stagger delay={0.2}>
            {CASES.map((item, index) => (
              <StaggerItem key={item.id} className="border-t border-line last:border-b">
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onClick={() => setActive(index)}
                  className="flex min-h-11 w-full items-start gap-4 py-4 text-left"
                >
                <span className="font-mono-data text-[12px] text-ink-faint">{item.id}</span>
                <span className={index === active ? "text-ink" : "text-ink-muted"}>
                  <span className="block text-[16px]">{item.title}</span>
                  <span className="mt-1 block text-[13px] text-ink-faint">{item.body}</span>
                </span>
              </button>
              </StaggerItem>
            ))}
          </Stagger>
          <div className="relative z-[2] aspect-[16/10] overflow-hidden rounded-[var(--radius-media)]">
            {CASES.map((item, index) => (
              <div
                key={item.id}
                className="absolute inset-0 transition-opacity duration-[var(--motion-section)] ease-[var(--ease-emphasized)]"
                style={{ opacity: index === active ? 1 : 0 }}
                aria-hidden={index !== active}
              >
                <ProductFrame src={item.src} alt={index === active ? item.alt : ""} className="h-full object-cover object-top" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
