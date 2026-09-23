import { Link } from "react-router-dom";
import { DocumentHead } from "@/components/seo/document-head";
import { LandingNav } from "@/pages/landing/components/LandingNav";
import { Footer } from "@/pages/landing/components/Footer";

const PAGES = {
  product: {
    title: "Product",
    headline: "Table-first GTM infrastructure.",
    body: "Workspace, waterfall, AI-колонки, сигналы и активация — в одном spreadsheet-first контуре.",
  },
  solutions: {
    title: "Solutions",
    headline: "Outbound, research и signal selling.",
    body: "От поиска компаний до квалифицированного списка в CRM — без ручной склейки источников.",
  },
  integrations: {
    title: "Integrations",
    headline: "Российский data stack вокруг платформы.",
    body: "DaData, Контур, ЕГРЮЛ, HH, amoCRM, Bitrix24, GigaChat, Yandex AI, Ollama, Telegram, Webhook.",
  },
  security: {
    title: "Security",
    headline: "Архитектура под 152-ФЗ.",
    body: "Data residency в РФ, RBAC, audit logs, SSO и on-premise — в дорожной карте, не в маркетинговом слогане.",
  },
  pricing: {
    title: "Pricing",
    headline: "Credits за результат, не за шум.",
    body: "Команда платит за enrichment и AI-run. На этом этапе — demo workspace без биллинга.",
  },
  docs: {
    title: "Docs",
    headline: "Документация появится вместе с API.",
    body: "Сейчас прототип работает на mock services. Контракт FastAPI уже заложен в src/lib/api.",
  },
} as const;

export function MarketingPage({ slug }: { slug: keyof typeof PAGES }) {
  const page = PAGES[slug];
  return (
    <div className="landing min-h-svh">
      <DocumentHead title={page.title} path={`/${slug}`} description={page.body} />
      <LandingNav />
      <main className="mx-auto max-w-[860px] px-5 pt-32 pb-24">
        <p className="text-[11px] tracking-[0.18em] text-ink-faint uppercase">{page.title}</p>
        <h1 className="mt-4 text-[44px] leading-[1.05] tracking-[-0.045em] lg:text-[64px]">{page.headline}</h1>
        <p className="mt-6 max-w-xl text-[16px] text-ink-muted">{page.body}</p>
        <Link
          to="/login"
          className="mt-8 inline-flex h-11 min-h-11 items-center rounded-full bg-[#F7F3E8] px-5 text-[13px] font-medium text-[#0A0D0B] hover:-translate-y-px"
        >
          Начать бесплатно
        </Link>
      </main>
      <Footer />
    </div>
  );
}
