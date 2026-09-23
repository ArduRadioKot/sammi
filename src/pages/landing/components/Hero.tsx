import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { productShots } from "@/assets/product/shots";
import { MaskedReveal } from "@/components/motion/MaskedReveal";
import { ProductFrame } from "@/components/motion/ScreenshotReveal";
import { motionTokens } from "@/lib/motion/tokens";
import { SilkGradient } from "@/pages/landing/components/SilkGradient";

const LINES = ["РЫНОК", "ЧИТАЕТСЯ", "КАК ТАБЛИЦА."];

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden px-5 pt-28 pb-12 lg:justify-center lg:px-10 lg:pb-20">
      <SilkGradient />
      <div className="relative z-[2] mx-auto grid w-full max-w-[1440px] items-end gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center">
        <div>
          <motion.p
            className="ds-label text-ink-faint"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.cinematic, delay: 0.18, ease: motionTokens.ease.smooth }}
          >
            GTM Intelligence / Russia
          </motion.p>
          <h1 className="mt-6 max-w-[11ch] text-[clamp(3.2rem,8vw,8.4rem)] leading-[0.88] font-medium tracking-[-0.055em]">
            {LINES.map((line, index) => (
              <MaskedReveal key={line} delay={0.36 + index * 0.18}>
                <span className="block">{line}</span>
              </MaskedReveal>
            ))}
          </h1>
          <motion.p
            className="mt-8 max-w-[38ch] text-[16px] leading-relaxed text-ink-muted"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.cinematic, delay: 0.96, ease: motionTokens.ease.smooth }}
          >
            Сырые компании проходят enrichment, research и квалификацию — и уходят в CRM уже как действие.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap gap-3"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionTokens.duration.cinematic, delay: 1.14, ease: motionTokens.ease.smooth }}
          >
            <Link
              to="/login"
              className="inline-flex h-11 min-h-11 items-center rounded-full bg-[#F7F3E8] px-5 text-[13px] font-medium text-[#0A0D0B] hover:-translate-y-px"
            >
              Начать бесплатно
            </Link>
            <a
              href="#workspace"
              className="inline-flex h-11 min-h-11 items-center rounded-full border border-[rgba(247,243,232,0.28)] px-5 text-[13px] text-[#F7F3E8]"
            >
              Посмотреть продукт
            </a>
          </motion.div>
        </div>
        <motion.div
          className="relative [backface-visibility:hidden]"
          initial={reduce ? false : { opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: motionTokens.duration.cinematic, delay: 0.62, ease: motionTokens.ease.smooth }}
        >
          <div className="relative z-[2] overflow-hidden rounded-[var(--radius-media)] border border-[rgba(247,245,239,0.1)]">
            <ProductFrame
              src={productShots.tableEditor}
              alt="Таблица компаний с колонками enrichment, AI Research, Intent и Score"
              className="h-[52vh] min-h-[320px] object-cover object-[12%_18%] lg:h-[68vh]"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
