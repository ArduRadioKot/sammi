import * as React from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

function TransparencySync() {
  const reduce = useUiStore((s) => s.reduceTransparency);
  React.useEffect(() => {
    document.documentElement.classList.toggle("reduce-transparency", reduce);
  }, [reduce]);
  return null;
}

function AuthHydrate() {
  const initialize = useAuthStore((s) => s.initialize);
  React.useEffect(() => {
    void initialize();
  }, [initialize]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={200}>
          <TransparencySync />
          <AuthHydrate />
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className:
                "!bg-surface-0 !text-ink !border-line !shadow-[var(--shadow-float)] !text-[13px]",
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
