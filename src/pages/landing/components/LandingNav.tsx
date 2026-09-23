import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink } from "react-router-dom";
import { LogoMark } from "@/components/shell/logo";
import { APP_NAME } from "@/lib/constants/config";
import { motionTokens } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/product", label: "Product", hint: "Workspace и Table Editor" },
  { to: "/solutions", label: "Platform", hint: "Outbound, research, signals" },
  { to: "/integrations", label: "Integrations", hint: "Российский data stack" },
  { to: "/security", label: "Security", hint: "Контур под 152-ФЗ" },
  { to: "/pricing", label: "Pricing", hint: "Credits за результат" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const titleId = useId();
  const ease = motionTokens.ease.smooth;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia("(min-width: 768px)").matches) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[80]">
        <div className="pointer-events-auto mx-auto flex h-20 max-w-[1440px] items-center justify-between px-6 lg:px-10">
          <Link to="/" className="flex items-center gap-2 text-[13px] font-medium" onClick={() => setOpen(false)}>
            <LogoMark className="h-4 w-4" />
            {APP_NAME}
          </Link>
          <div
            className={cn(
              "flex items-center gap-1 rounded-full border p-1 transition-[background,border-color,box-shadow] duration-[var(--motion-section)]",
              scrolled || open
                ? "border-[rgba(247,243,232,0.14)] bg-[rgba(7,18,16,0.82)] shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-[18px]"
                : "border-[rgba(247,243,232,0.12)] bg-[rgba(7,18,16,0.55)] backdrop-blur-[14px]",
            )}
          >
            <nav className="hidden items-center md:flex">
              {LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      "rounded-full px-3 py-2 text-[13px] text-ink-muted transition-colors duration-[var(--motion-ui)] hover:bg-[rgba(247,243,232,0.08)] hover:text-ink",
                      isActive && "bg-[rgba(247,243,232,0.1)] text-ink",
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <Link
              to="/login"
              className="hidden rounded-full px-3 py-2 text-[13px] text-ink-muted transition-colors hover:text-ink md:inline"
            >
              Войти
            </Link>
            <Link
              to="/login"
              className="hidden h-11 min-h-11 items-center rounded-full bg-[#F7F3E8] px-4 text-[13px] font-medium text-[#0A0D0B] md:inline-flex"
            >
              Начать бесплатно
            </Link>
            <button
              type="button"
              className="relative flex size-11 min-h-11 items-center justify-center rounded-full md:hidden"
              aria-label={open ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={open}
              aria-controls="landing-menu"
              onClick={() => setOpen((value) => !value)}
            >
              <span className="flex w-4 flex-col gap-[5px]">
                <span
                  className={cn(
                    "block h-px w-full bg-[#F7F3E8] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    open && "translate-y-[6px] rotate-45",
                  )}
                />
                <span className={cn("block h-px w-full bg-[#F7F3E8] transition-opacity duration-300", open && "opacity-0")} />
                <span
                  className={cn(
                    "block h-px w-full bg-[#F7F3E8] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    open && "-translate-y-[6px] -rotate-45",
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {createPortal(
            <AnimatePresence>
              {open ? (
                <motion.button
                  key="landing-menu-backdrop"
                  type="button"
                  aria-label="Закрыть меню"
                  className="fixed inset-0 z-[70] bg-[rgba(4,9,10,0.62)] backdrop-blur-[8px] md:hidden"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.5, ease }}
                  onClick={() => setOpen(false)}
                />
              ) : null}
              {open ? (
                <motion.aside
                  key="landing-menu-panel"
                  id="landing-menu"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  className="landing fixed inset-y-0 right-0 z-[75] flex h-svh w-[min(100vw,34rem)] flex-col border-l border-[rgba(247,243,232,0.08)] bg-[#071210] px-8 pt-8 pb-10 text-[#F7F5EF] md:hidden"
                  initial={reduce ? false : { x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ duration: reduce ? 0 : 0.7, ease }}
                >
                  <div className="flex items-center justify-between">
                    <h2 id={titleId} className="ds-label text-ink-faint">
                      Меню
                    </h2>
                    <button
                      type="button"
                      className="flex size-11 min-h-11 items-center justify-center rounded-full border border-[rgba(247,243,232,0.16)] text-[13px] text-[#F7F3E8]"
                      aria-label="Закрыть меню"
                      onClick={() => setOpen(false)}
                    >
                      Закрыть
                    </button>
                  </div>
                  <nav className="flex flex-1 flex-col justify-center gap-1">
                    {LINKS.map((link, index) => (
                      <motion.div
                        key={link.to}
                        initial={reduce ? false : { opacity: 0, x: 28 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.55, delay: reduce ? 0 : 0.1 + index * 0.05, ease }}
                      >
                        <NavLink
                          to={link.to}
                          onClick={() => setOpen(false)}
                          className="group flex items-baseline gap-5 border-b border-[rgba(247,243,232,0.08)] py-4"
                        >
                          <span className="font-mono-data text-[11px] text-ink-faint">0{index + 1}</span>
                          <span>
                            <span className="block text-[clamp(1.8rem,6vw,2.6rem)] leading-[1.02] tracking-[-0.045em] transition-colors duration-500 group-hover:text-[#CDE7E0]">
                              {link.label}
                            </span>
                            <span className="mt-1 block text-[13px] text-ink-faint">{link.hint}</span>
                          </span>
                        </NavLink>
                      </motion.div>
                    ))}
                  </nav>
                  <div className="flex flex-wrap items-center gap-3 pt-8">
                    <Link
                      to="/login"
                      onClick={() => setOpen(false)}
                      className="inline-flex h-11 min-h-11 items-center text-[13px] text-ink-muted hover:text-ink"
                    >
                      Войти
                    </Link>
                    <Link
                      to="/login"
                      onClick={() => setOpen(false)}
                      className="inline-flex h-11 min-h-11 items-center rounded-full bg-[#F7F3E8] px-5 text-[13px] font-medium text-[#0A0D0B]"
                    >
                      Начать бесплатно
                    </Link>
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>,
            document.body,
          )}
    </>
  );
}
