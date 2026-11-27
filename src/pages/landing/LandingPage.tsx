import { DocumentHead } from "@/components/seo/document-head";
import { FinalCTA } from "@/pages/landing/components/FinalCTA";
import { Footer } from "@/pages/landing/components/Footer";
import { Hero } from "@/pages/landing/components/Hero";
import { LandingNav } from "@/pages/landing/components/LandingNav";
import { RelationshipSections } from "@/pages/landing/components/RelationshipSections";
import "./landing.css";
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 0);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <div className="landing route-landing min-h-svh">
      <DocumentHead
        path="/"
        title="Понимайте, кто действительно принимает решения"
        description="Карта отношений, роли и риски коммуникаций внутри корпоративных клиентов."
      />
      <a className="route-skip" href="#main">К содержанию</a>
      <LandingNav />
      <main id="main" tabIndex={-1}>
        <Hero />
        <RelationshipSections />
        <FinalCTA />
      </main>
      <Footer />
      {scrolled && <a href="#top" className="route-back-top" aria-label="Вернуться наверх"><ArrowUp size={22} /></a>}
    </div>
  );
}
