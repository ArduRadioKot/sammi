import { Helmet } from "react-helmet-async";
import { APP_NAME } from "@/lib/constants/config";

export function DocumentHead({
  title,
  description,
  noIndex,
  path = "/",
}: {
  title?: string;
  description?: string;
  noIndex?: boolean;
  path?: string;
}) {
  const fullTitle = title ? `${title} · ${APP_NAME}` : `${APP_NAME} — Revenue Intelligence`;
  const desc =
    description ??
    "Платформа объединяет поиск компаний, enrichment, AI-research, сигналы и автоматизацию outbound-продаж.";

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={path} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      {noIndex ? <meta name="robots" content="noindex, nofollow" /> : <meta name="robots" content="index, follow" />}
    </Helmet>
  );
}
