import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { LogoMark } from "@/components/shell/logo";
import { DocumentHead } from "@/components/seo/document-head";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/forms";
import { Check, Copy } from "lucide-react";
import { productShots } from "@/assets/product/shots";
import { APP_NAME } from "@/lib/constants/config";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { motionTokens } from "@/lib/motion/tokens";
import { useAuthStore } from "@/stores/auth-store";

const schema = z.object({
  email: z.string().email("Введите рабочий email"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"idle" | "loading" | "success">("idle");
  const [copied, setCopied] = useState(false);
  const [demoEmail] = useState(() => {
    const key = "sammi.demo-login";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated = `demo+${window.crypto.randomUUID()}@example.com`;
    window.localStorage.setItem(key, generated);
    return generated;
  });
  const from = (location.state as { from?: string } | null)?.from ?? "/app";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: demoEmail },
  });

  const copyDemoLogin = async () => {
    try {
      await navigator.clipboard.writeText(demoEmail);
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = demoEmail;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.append(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setPhase("loading");
    try {
      await login(values.email);
      setPhase("success");
      navigate(from.startsWith("/app") ? from : "/app", { replace: true });
    } catch {
      setPhase("idle");
      form.setError("email", { message: "Не удалось войти. Проверьте email и соединение с API." });
    }
  });

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]">
      <DocumentHead title="Вход" path="/login" noIndex description="Войти в платформу." />
      <aside className="landing relative hidden min-h-svh overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(150,124,255,.30),transparent_34%),radial-gradient(circle_at_22%_78%,rgba(53,0,211,.34),transparent_42%),linear-gradient(145deg,#0C0032_0%,#190061_55%,#240090_100%)]" />
        <div className="landing-grain absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Link to="/" className="flex items-center gap-2 text-[13px]">
            <LogoMark className="h-4 w-4" />
            {APP_NAME}
          </Link>
          <div>
            <p className="ds-label text-ink-faint">Customer Relationship Intelligence</p>
            <h1 className="mt-6 max-w-[8ch] text-[56px] leading-[0.92] font-medium tracking-[-0.05em]">
              Сигнал становится действием.
            </h1>
          </div>
          <div className="overflow-hidden rounded-[var(--radius-media)] border border-[rgba(247,245,239,0.1)] opacity-80">
            <img
              src={productShots.tableEditor}
              alt="Таблица компаний с колонками enrichment, AI Research, Intent и Score"
              className="h-48 w-full object-cover object-top"
            />
          </div>
        </div>
      </aside>
      <main className="relative flex min-h-svh items-center bg-bg px-6 py-16 text-ink">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <motion.form
          onSubmit={onSubmit}
          className="relative mx-auto w-full max-w-[380px]"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionTokens.duration.section, ease: motionTokens.ease.emphasized }}
        >
          <Link to="/" className="mb-10 flex items-center gap-2 text-[13px] lg:hidden">
            <LogoMark className="h-4 w-4" />
            {APP_NAME}
          </Link>
          <p className="ds-label text-ink-faint">Access</p>
          <h2 className="mt-3 text-[34px] tracking-[-0.04em]">Войти в платформу</h2>
          <p className="mt-2 text-[15px] text-ink-muted">
            Продолжите работу с данными, сигналами и автоматизациями.
          </p>
          <div className="mt-8">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@company.ru"
              className="mt-1 h-11 bg-surface-0"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="mt-1 text-[12px] text-danger">{form.formState.errors.email.message}</p>
            )}
          </div>
          <Button className="mt-6 w-full" size="lg" type="submit" disabled={phase !== "idle"}>
            {phase === "loading" ? "Входим…" : phase === "success" ? "Готово" : "Войти"}
          </Button>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-3 py-2 text-[12px]">
            <span className="min-w-0 text-ink-muted">Демо-логин <span className="select-all font-medium text-ink">{demoEmail}</span></span>
            <button type="button" onClick={() => void copyDemoLogin()} className="flex shrink-0 items-center gap-1.5 text-accent hover:opacity-80" aria-label="Скопировать демо-логин">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
          <p className="mt-4 text-[12px] text-ink-faint">
            Демо-вход без пароля. Для отдельного рабочего аккаунта укажите свой email.
          </p>
        </motion.form>
      </main>
    </div>
  );
}
