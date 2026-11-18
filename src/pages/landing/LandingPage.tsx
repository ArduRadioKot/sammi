import { DocumentHead } from "@/components/seo/document-head";
import { FinalCTA } from "@/pages/landing/components/FinalCTA";
import { Footer } from "@/pages/landing/components/Footer";
import { Hero } from "@/pages/landing/components/Hero";
import { LandingNav } from "@/pages/landing/components/LandingNav";
import { RelationshipSections } from "@/pages/landing/components/RelationshipSections";
import "./landing.css";

export function LandingPage() {
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
    </div>
  );
}
