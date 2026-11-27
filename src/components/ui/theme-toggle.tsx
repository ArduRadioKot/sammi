import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme/theme-provider";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <button type="button" aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-0 text-ink"
      onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
