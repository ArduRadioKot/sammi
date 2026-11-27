import { Link, useLocation } from "react-router-dom";
import { LogoMark } from "@/components/shell/logo";
import { APP_NAME } from "@/lib/constants/config";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const LINKS = [
  ["relationship-map", "Карта ЛПР"],
  ["insights", "Аналитика"],
  ["workflow", "Как это работает"],
  ["platform", "Данные"],
];

export function LandingNav() {
  const { pathname } = useLocation();
  const home = pathname === "/" ? "" : "/";

  return (
    <header id="top" className="route-nav route-wrap">
      <a href={home || "#top"} className="route-brand">
        <LogoMark className="size-5" />
        {APP_NAME}
      </a>
      <nav aria-label="Навигация сайта">
        {LINKS.map(([id, label]) => <a key={id} href={`${home}#${id}`}>{label}</a>)}
      </nav>
      <div className="flex items-center gap-2"><ThemeToggle /><Link to="/login" className="route-nav-login">Войти</Link></div>
    </header>
  );
}
