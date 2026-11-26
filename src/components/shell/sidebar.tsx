import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bot,
  Building2,
  CreditCard,
  House,
  Map,
  Menu,
  PanelLeft,
  Plug,
  Radio,
  Send,
  Settings,
  Table2,
  Users,
} from "lucide-react";
import { APP_NAME, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from "@/lib/constants/config";
import { ru } from "@/lib/i18n/ru";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/overlays";
import { useTheme } from "@/lib/theme/theme-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

const NAV = [
  { href: "/app", label: ru.nav.home, icon: House, exact: true },
  {
    section: ru.nav.data,
    items: [
      { href: "/app/tables", label: ru.nav.tables, icon: Table2 },
      { href: "/app/people", label: ru.nav.people, icon: Users },
      { href: "/app/companies", label: ru.nav.companies, icon: Building2 },
      { href: "/app/map", label: ru.nav.map, icon: Map },
    ],
  },
  {
    section: ru.nav.intelligence,
    items: [
      { href: "/app/audiences", label: ru.nav.audiences, icon: Radio },
      { href: "/app/signals", label: ru.nav.signals, icon: Activity },
      { href: "/app/agents", label: ru.nav.agents, icon: Bot },
    ],
  },
  {
    section: ru.nav.activation,
    items: [{ href: "/app/campaigns", label: ru.nav.campaigns, icon: Send }],
  },
  {
    section: ru.nav.platform,
    items: [
      { href: "/app/integrations", label: ru.nav.integrations, icon: Plug },
      { href: "/app/usage", label: ru.nav.usage, icon: CreditCard },
    ],
  },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  collapsed,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof House;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      to={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-8 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-[13px] transition-colors",
        collapsed && "justify-center px-0",
        active ? "bg-surface-0 text-ink" : "text-ink-muted hover:bg-surface-0/70 hover:text-ink",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--green-400)]"
        />
      )}
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const user = useAuthStore((s) => s.user);
  const workspace = useAuthStore((s) => s.workspace);
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme } = useTheme();

  const displayName = user?.name ?? "Пользователь";
  const displayEmail = user?.email ?? "";
  const initial = displayName.slice(0, 1).toUpperCase();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const closeMobile = () => setMobileNavOpen(false);

  return (
    <>
      <button
        type="button"
        className="fixed top-3 left-3 z-30 flex size-9 items-center justify-center rounded-[var(--radius-sm)] border border-line bg-surface-0 lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Открыть меню"
      >
        <Menu className="size-4" />
      </button>
      <aside
        className={cn(
          "z-50 flex h-full flex-col border-r border-line bg-sidebar transition-[transform,width] duration-[var(--motion-base)]",
          "fixed inset-y-0 left-0 lg:static",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      >
        <div className={cn("flex h-12 items-center gap-2 px-2", collapsed && "justify-center")}>
          <div className="flex size-7 items-center justify-center text-ink">
            <LogoMark className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{APP_NAME}</div>
              <div className="truncate text-[11px] text-ink-muted">{workspace?.name ?? "Workspace"}</div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-auto px-2 py-2">
          <NavLink
            href="/app"
            label={ru.nav.home}
            icon={House}
            collapsed={collapsed}
            active={isActive("/app", true)}
            onNavigate={closeMobile}
          />
          {NAV.slice(1).map((group) => {
            if (!("section" in group)) return null;
            return (
              <div key={group.section}>
                {!collapsed && (
                  <div className="px-2 pb-1 text-[10.5px] font-medium text-ink-faint">
                    {group.section}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      collapsed={collapsed}
                      active={isActive(item.href)}
                      onNavigate={closeMobile}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="space-y-0.5 border-t border-line px-2 py-2">
          <NavLink
            href="/app/settings"
            label={ru.nav.settings}
            icon={Settings}
            collapsed={collapsed}
            active={isActive("/app/settings")}
            onNavigate={closeMobile}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "mt-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1.5 text-left hover:bg-surface-0/70",
                  collapsed && "justify-center px-0",
                )}
              >
                <div className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium">
                  {initial}
                </div>
                {!collapsed && (
                  <div className="min-w-0">
                    <div className="truncate text-[12px]">{displayName}</div>
                    <div className="truncate text-[11px] text-ink-muted">{displayEmail}</div>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <div className="px-2 py-1.5">
                <div className="text-[13px]">{displayName}</div>
                <div className="text-[11px] text-ink-muted">{displayEmail}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/app/settings")}>Account</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/app/settings")}>Settings</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")
                }
              >
                Theme: {theme}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void logout().then(() => navigate("/login"));
                }}
              >
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 hidden w-full lg:inline-flex"
            onClick={toggle}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            <PanelLeft className="size-4" />
          </Button>
        </div>
      </aside>
    </>
  );
}
