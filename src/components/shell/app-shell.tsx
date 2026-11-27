import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { CommandPalette } from "@/components/shell/command-palette";
import { AppSidebar } from "@/components/shell/sidebar";
import { useUiStore } from "@/stores/ui-store";

export function AppLayout() {
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-ink">
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-40 bg-[rgba(20,23,22,0.36)] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <AppSidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-12 lg:pt-0">
        <div className="min-h-0 flex-1 overflow-hidden"><Outlet /></div>
      </main>
      <CommandPalette />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-ink">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      <CommandPalette />
    </div>
  );
}
