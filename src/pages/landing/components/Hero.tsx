import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "@/components/motion/Reveal";
import { ProductScreenshot } from "./ProductScreenshot";
import { SilkGradient } from "./SilkGradient";
import { stakeholderShot } from "./landingShots";

const VIEWS = [
  {
    label: "Оргструктура",
    description: "Подразделения, роли, подчинение и рабочие связи.",
    shot: stakeholderShot,
  },
  {
    label: "Влияние",
    description: "Кто влияет на выбор и какие связи подтверждены.",
    shot: {
      src: "/product/one-route/influence.webp",
      preview: "/product/one-route/influence-preview.webp",
      mobile: "/product/one-route/influence-mobile.webp",
      width: 2280,
      height: 1455,
      title: "Карта ЛПР · Влияние",
      alt: "Связи влияния между сотрудниками Северного банка и открытая вкладка связей Марии Соколовой.",
    },
  },
];

export function Hero() {
  const [selected, setSelected] = useState(0);
  const view = VIEWS[selected];

  return (
    <section className="route-hero">
      <SilkGradient />
      <div className="route-wrap relative">
        <div className="route-hero-copy">
          <Reveal>
            <h1>Понимайте, кто действительно принимает решения</h1>
          </Reveal>
          <Reveal delay={0.08} className="route-hero-intro">
            <p>Карта отношений с корпоративным клиентом показывает, кто влияет на выбор и где команде не хватает контактов.</p>
            <a className="route-button" href="#relationship-map">Смотреть демо <ArrowDown aria-hidden="true" size={17} /></a>
          </Reveal>
        </div>
        <Reveal delay={0.12} y={24}>
          <figure id="relationship-map" className="route-demo">
            <figcaption className="route-demo-bar">
              <div>
                <span className="route-demo-title">Карта ЛПР</span>
                <span className="route-demo-label">Северный банк · тестовые данные</span>
              </div>
              <div className="route-switch" role="group" aria-label="Вид карты ЛПР">
                {VIEWS.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={selected === index}
                    aria-controls="relationship-preview"
                    onClick={() => setSelected(index)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </figcaption>
            <div id="relationship-preview">
              <ProductScreenshot key={view.label} shot={view.shot} priority />
            </div>
            <div className="route-demo-caption">
              <p aria-live="polite">{view.description}</p>
              <Link className="route-text-link" to="/app/companies/demo-northbank/stakeholders">
                Открыть демо в приложении <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
