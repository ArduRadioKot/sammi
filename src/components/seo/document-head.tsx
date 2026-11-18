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
  const fullTitle = title ? `${title} · ${APP_NAME}` : `${APP_NAME} — Customer Relationship Intelligence`;
  const desc =
    description ??
    "one-route помогает увидеть структуру принятия решений, ключевые отношения и риски коммуникаций внутри корпоративных клиентов.";

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
