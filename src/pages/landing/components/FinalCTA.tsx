import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Reveal } from "@/components/motion/Reveal";

export function FinalCTA() {
  return (
    <section className="route-end route-wrap">
      <Reveal><h2>Начните с одного клиента</h2></Reveal>
      <Reveal delay={0.08}>
        <Link className="route-button" to="/app/companies/demo-northbank/stakeholders">
          Открыть карту ЛПР <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
      </Reveal>
    </section>
  );
}
