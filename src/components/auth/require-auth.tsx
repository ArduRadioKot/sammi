import { useEffect, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";

export function RequireAuth() {
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    if (status === "initializing") void initialize();
  }, [initialize, status]);

  if (status === "initializing") {
    return <div className="grid h-svh place-items-center text-[13px] text-ink-muted">Загрузка…</div>;
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    if (status === "initializing") void initialize();
  }, [initialize, status]);

  if (status === "initializing") return null;
  if (status === "authenticated") return <Navigate to="/app" replace />;
  return children;
}
