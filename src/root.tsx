import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAuth } from "@/components/auth/require-auth";
import { AppLayout } from "@/components/shell/app-shell";
import { Providers } from "@/components/shell/providers";
import { LandingPage } from "@/pages/landing/LandingPage";
import { LoginPage } from "@/pages/login/LoginPage";
const MarketingPage = lazy(() =>
  import("@/pages/marketing/MarketingPage").then((mod) => ({ default: mod.MarketingPage })),
);
const DashboardPage = lazy(() => import("@/pages/app/dashboard"));
const TablesPage = lazy(() => import("@/pages/app/tables"));
const TablePage = lazy(() => import("@/pages/app/table-page"));
const RelationshipAnalysisPage = lazy(() => import("@/features/relationship/relationship-analysis-page"));
const PeoplePage = lazy(() => import("@/pages/app/people"));
const CompaniesPage = lazy(() => import("@/pages/app/companies"));
const StakeholderMapPage = lazy(() => import("@/features/stakeholders/stakeholder-map-page"));
const MapPage = lazy(() => import("@/pages/app/map"));
const AudiencesPage = lazy(() => import("@/pages/app/audiences"));
const SignalsPage = lazy(() => import("@/pages/app/signals"));
const AgentsPage = lazy(() => import("@/pages/app/agents"));
const CampaignsPage = lazy(() => import("@/pages/app/campaigns"));
const CampaignDetailsPage = lazy(() => import("@/pages/app/campaign-details"));
const IntegrationsPage = lazy(() => import("@/pages/app/integrations"));
const UsagePage = lazy(() => import("@/pages/app/usage"));
const SettingsPage = lazy(() => import("@/pages/app/settings"));

function PageFallback() {
  return (
    <div className="grid h-svh place-items-center bg-bg text-[13px] text-ink-muted">
      Загрузка…
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/product"
        element={
          <LazyPage>
            <MarketingPage slug="product" />
          </LazyPage>
        }
      />
      <Route
        path="/solutions"
        element={
          <LazyPage>
            <MarketingPage slug="solutions" />
          </LazyPage>
        }
      />
      <Route
        path="/integrations"
        element={
          <LazyPage>
            <MarketingPage slug="integrations" />
          </LazyPage>
        }
      />
      <Route
        path="/security"
        element={
          <LazyPage>
            <MarketingPage slug="security" />
          </LazyPage>
        }
      />
      <Route
        path="/pricing"
        element={
          <LazyPage>
            <MarketingPage slug="pricing" />
          </LazyPage>
        }
      />
      <Route
        path="/docs"
        element={
          <LazyPage>
            <MarketingPage slug="docs" />
          </LazyPage>
        }
      />
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route
            index
            element={
              <LazyPage>
                <DashboardPage />
              </LazyPage>
            }
          />
          <Route
            path="tables"
            element={
              <LazyPage>
                <TablesPage />
              </LazyPage>
            }
          />
          <Route
            path="tables/:id"
            element={
              <LazyPage>
                <TablePage />
              </LazyPage>
            }
          />
          <Route
            path="tables/:id/relationship-analysis"
            element={<LazyPage><RelationshipAnalysisPage /></LazyPage>}
          />
          <Route
            path="people"
            element={
              <LazyPage>
                <PeoplePage />
              </LazyPage>
            }
          />
          <Route
            path="companies"
            element={
              <LazyPage>
                <CompaniesPage />
              </LazyPage>
            }
          />
          <Route
            path="companies/:companyId/stakeholders"
            element={
              <LazyPage>
                <StakeholderMapPage />
              </LazyPage>
            }
          />
          <Route
            path="map"
            element={
              <LazyPage>
                <MapPage />
              </LazyPage>
            }
          />
          <Route
            path="audiences"
            element={
              <LazyPage>
                <AudiencesPage />
              </LazyPage>
            }
          />
          <Route
            path="signals"
            element={
              <LazyPage>
                <SignalsPage />
              </LazyPage>
            }
          />
          <Route
            path="agents"
            element={
              <LazyPage>
                <AgentsPage />
              </LazyPage>
            }
          />
          <Route
            path="campaigns"
            element={
              <LazyPage>
                <CampaignsPage />
              </LazyPage>
            }
          />
          <Route
            path="campaigns/:id"
            element={
              <LazyPage>
                <CampaignDetailsPage />
              </LazyPage>
            }
          />
          <Route
            path="integrations"
            element={
              <LazyPage>
                <IntegrationsPage />
              </LazyPage>
            }
          />
          <Route
            path="usage"
            element={
              <LazyPage>
                <UsagePage />
              </LazyPage>
            }
          />
          <Route
            path="settings"
            element={
              <LazyPage>
                <SettingsPage />
              </LazyPage>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  );
}
