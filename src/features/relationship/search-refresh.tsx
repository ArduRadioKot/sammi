import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/forms";
import { usePreferences } from "@/stores/preferences-store";
import { parseSearchKeywords, searchKeywordError } from "./search-keywords";

export function SearchRefresh({ initial, disabled, onSearch }: {
  initial?: string[];
  disabled: boolean;
  onSearch: (keywords: string[], urls: string[]) => Promise<void>;
}) {
  const defaults = usePreferences((state) => state.searchKeywords);
  const [keywords, setKeywords] = useState(initial?.join("\n") ?? defaults);
  const [links, setLinks] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const phrases = parseSearchKeywords(keywords);
    const urls = [...new Set(links.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
    const invalid = searchKeywordError(phrases) || (
      urls.length > 8 || urls.some((url) => !/^https:\/\//i.test(url) || url.length > 2000)
        ? "Добавьте до восьми HTTPS-ссылок, по одной на строку." : ""
    );
    setError(invalid);
    if (!invalid) await onSearch(phrases, urls);
  };
  return (
    <form className="space-y-3 rounded-lg border border-line bg-surface-0 p-4" onSubmit={(event) => void submit(event)}>
      <div>
        <h3 className="text-base font-medium">Поиск для этого отчёта</h3>
        <p className="mt-1 text-sm text-ink-muted">Новые результаты дополнят сохранённые материалы. Используйте темы, названия проектов или конференций.</p>
      </div>
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Ключевые слова
          <Textarea value={keywords} maxLength={850} className="min-h-20" placeholder="По одной фразе на строку"
            onChange={(event) => setKeywords(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          Проверенные ссылки
          <Textarea value={links} maxLength={16008} className="min-h-20" placeholder="HTTPS-ссылки на публикации и программы"
            onChange={(event) => setLinks(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" variant="accent">Обновить поиск</Button>
          <Link to="/app/integrations#search" className="text-sm text-accent hover:underline">Интеграция SearXNG</Link>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
