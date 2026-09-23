import { DocumentHead } from "@/components/seo/document-head";
import { ActivationStory } from "@/pages/landing/components/ActivationStory";
import { AIStory } from "@/pages/landing/components/AIStory";
import { CinematicField } from "@/pages/landing/components/CinematicField";
import { CursorField } from "@/pages/landing/components/CursorField";
import { FinalCTA } from "@/pages/landing/components/FinalCTA";
import { Footer } from "@/pages/landing/components/Footer";
import { Hero } from "@/pages/landing/components/Hero";
import { IntegrationMap } from "@/pages/landing/components/IntegrationMap";
import { LandingNav } from "@/pages/landing/components/LandingNav";
import { ProductProofMobile, ProductStage } from "@/pages/landing/components/ProductStage";
import { ProofStrip } from "@/pages/landing/components/ProofStrip";
import { QualificationStory } from "@/pages/landing/components/QualificationStory";
import { QuietThesis } from "@/pages/landing/components/QuietThesis";
import { SecuritySection } from "@/pages/landing/components/SecuritySection";
import { SignalsStory } from "@/pages/landing/components/SignalsStory";
import { UseCases } from "@/pages/landing/components/UseCases";
import { WaterfallStory } from "@/pages/landing/components/WaterfallStory";

export function LandingPage() {
  return (
    <div className="landing min-h-svh overflow-x-clip">
      <DocumentHead
        path="/"
        description="От сырых данных — к сигналу и действию. Российская B2B GTM-инфраструктура."
      />
      <CursorField />
      <LandingNav />
      <Hero />
      <QuietThesis />
      <ProductStage />
      <ProductProofMobile />
      <WaterfallStory />
      <CinematicField />
      <AIStory />
      <ProofStrip />
      <SignalsStory />
      <QualificationStory />
      <ActivationStory />
      <IntegrationMap />
      <SecuritySection />
      <UseCases />
      <FinalCTA />
      <Footer />
    </div>
  );
}
