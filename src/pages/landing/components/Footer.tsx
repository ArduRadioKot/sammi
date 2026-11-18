import { useLocation } from "react-router-dom";
import { APP_NAME } from "@/lib/constants/config";
import { LogoMark } from "@/components/shell/logo";

export function Footer() {
  const { pathname } = useLocation();
  const home = pathname === "/" ? "" : "/";

  return (
    <footer className="route-footer route-wrap">
      <a href={home || "#top"} className="route-brand"><LogoMark className="size-5" />{APP_NAME}</a>
      <nav aria-label="Навигация в подвале">
        <a href={`${home}#relationship-map`}>Карта ЛПР</a>
        <a href={`${home}#insights`}>Аналитика</a>
        <a href={`${home}#platform`}>Данные</a>
      </nav>
      <p>Customer Relationship Intelligence</p>
    </footer>
  );
}
