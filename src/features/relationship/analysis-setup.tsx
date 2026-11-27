import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/forms";
import type { AnalysisDocument, AnalysisField, AnalysisPublications, ColumnMapping, RefreshHours } from "@/services/relationship-analysis";
import { usePreferences } from "@/stores/preferences-store";
import { parseSearchKeywords, searchKeywordError } from "./search-keywords";
import type { ColumnDefinition } from "@/types/domain";

const primaryFields: Array<[AnalysisField, string]> = [
  ["name", "ФИО контакта"], ["company", "Компания"], ["title", "Должность"], ["department", "Подразделение"],
];
const extraFields: Array<[AnalysisField, string]> = [
  ["contact_key", "ID контакта"], ["role", "Роль из CRM"], ["authority", "Право подписи"],
  ["assessment", "Оценка влияния (0–1)"], ["interaction", "Текст взаимодействия"],
  ["occurred_at", "Дата взаимодействия"], ["feedback", "Обратная связь"],
  ["interaction_type", "Канал взаимодействия"], ["author", "Кто общался"], ["project", "Проект"],
  ["loyalty", "Лояльность контакта из CRM"], ["account_loyalty", "Лояльность клиента из CRM"],
  ["related_contact", "ID или ФИО второго контакта"], ["relation_type", "Тип или область связи"],
  ["public_text", "Текст публикации"], ["public_url", "Ссылка на публикацию"], ["public_date", "Дата публикации"],
];
export const selectClass = "h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-sm text-ink";
export const refreshOptions = [
  { value: "", label: "Только при запуске" }, { value: "24", label: "Раз в день" }, { value: "168", label: "Раз в неделю" },
];
export const parseRefresh = (value: string): RefreshHours => value === "24" ? 24 : value === "168" ? 168 : null;
const isAudio = (file: File) => /\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(file.name);
const lines = (value: string) => [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
const externalLinks = (values: string[], limit: number) =>
  values.length <= limit && values.every((url) => /^https:\/\//i.test(url) && url.length <= 2000);

export function SetupForm({
  columns, initial, initialKeywords, saving, replacing, webSearchConfigured, onStart,
}: {
  columns: ColumnDefinition[];
  initial: ColumnMapping;
  initialKeywords?: string[];
  saving: boolean;
  replacing: boolean;
  webSearchConfigured: boolean;
  onStart: (mapping: ColumnMapping, documents: AnalysisDocument[], publications: AnalysisPublications) => Promise<void>;
}) {
  const [mapping, setMapping] = useState(initial);
  const [documents, setDocuments] = useState<AnalysisDocument[]>([]);
  const [fileError, setFileError] = useState("");
  const [links, setLinks] = useState("");
  const [fetchCsvUrls, setFetchCsvUrls] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [feedUrls, setFeedUrls] = useState("");
  const preferredKeywords = usePreferences((state) => state.searchKeywords);
  const [keywords, setKeywords] = useState(initialKeywords?.join("\n") ?? preferredKeywords);
  const preferredSearch = usePreferences((state) => state.searchByDefault);
  const preferredRefresh = usePreferences((state) => state.refreshHours);
  const startsWithSearch = webSearchConfigured && preferredSearch !== false;
  const [refreshHours, setRefreshHours] = useState<RefreshHours>(
    preferredRefresh === "automatic" ? (startsWithSearch ? 24 : null) : preferredRefresh,
  );
  const [useWebSearch, setUseWebSearch] = useState(startsWithSearch);
  const fields = (items: Array<[AnalysisField, string]>) => items.map(([field, label]) => (
    <label key={field} className="grid gap-1 text-xs text-ink-muted">
      {label}{field === "name" ? " *" : ""}
      <select
        className={selectClass}
        required={field === "name"}
        value={mapping[field] ?? ""}
        onChange={(event) => setMapping({ ...mapping, [field]: event.target.value || null })}
      >
        <option value="">{field === "company" ? "Название таблицы" : "Выберите столбец"}</option>
        {columns.filter((column) => !column.analysisOutput).map((column) => (
          <option key={column.id} value={column.id}>{column.name}</option>
        ))}
      </select>
    </label>
  ));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const urls = lines(links);
    const feeds = lines(feedUrls);
    if (!externalLinks(urls, 8)) {
      setLinkError("Вставьте до восьми HTTPS-ссылок, по одной на строку.");
      return;
    }
    if (!externalLinks(feeds, 4)) {
      setLinkError("Вставьте до четырёх HTTPS-ссылок на RSS или Atom.");
      return;
    }
    const phrases = useWebSearch ? parseSearchKeywords(keywords) : [];
    const error = searchKeywordError(phrases);
    if (error) { setLinkError(error); return; }
    setLinkError("");
    await onStart(mapping, documents, {
      urls, fetch_csv_urls: !!mapping.public_url && fetchCsvUrls, feed_urls: feeds,
      refresh_hours: feeds.length || useWebSearch ? refreshHours : null, web_search: useWebSearch, search_keywords: phrases,
    });
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5 rounded-lg border border-line bg-surface-0 p-4 md:p-5">
      <div>
        <h2 className="text-base font-medium">Источники анализа</h2>
        <p className="mt-1 text-sm text-ink-muted">Используйте одну таблицу на клиента. Для истории добавьте отдельную строку на каждое взаимодействие и повторите ID контакта.</p>
      </div>
      <fieldset className="space-y-4" disabled={saving}>
        <div className="grid gap-3 sm:grid-cols-2">{fields(primaryFields)}</div>
        <details className="rounded-md border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Роли, взаимодействия, связи и публикации</summary>
          <div className="grid gap-3 py-3 sm:grid-cols-2">{fields(extraFields)}</div>
        </details>
        <section className="space-y-3 border-t border-line pt-4" aria-labelledby="attachments-title">
          <div>
            <h3 id="attachments-title" className="text-sm font-medium">Материалы</h3>
            <p className="mt-1 text-xs text-ink-muted">До восьми файлов по 5 МБ. Поддерживаются PDF, PPTX, HTML, стенограммы и до трёх аудиозаписей по две минуты.</p>
          </div>
          <div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 accent-accent" disabled={!webSearchConfigured} checked={useWebSearch}
                onChange={(event) => setUseWebSearch(event.target.checked)} />
              Искать публикации в интернете по ФИО и компании
            </label>
            <p className="mt-1 text-xs text-ink-muted">
              {webSearchConfigured ? "В поисковый запрос входят ФИО и название компании." : "Для веб-поиска подключите SearXNG на сервере."}
            </p>
          </div>
          {useWebSearch && <label className="grid gap-1 text-xs text-ink-muted">
            Ключевые слова для этого клиента
            <Textarea value={keywords} maxLength={850} className="min-h-16" placeholder="Через запятую или с новой строки"
              onChange={(event) => { setKeywords(event.target.value); setLinkError(""); }} />
          </label>}
          <label className="grid gap-1 text-xs text-ink-muted">
            Ссылки для фоновой загрузки
            <Textarea
              value={links}
              className="min-h-[76px]"
              maxLength={16008}
              placeholder="По одной HTTPS-ссылке на строку"
              onChange={(event) => {
                setLinks(event.target.value);
                setLinkError("");
              }}
            />
          </label>
          <label className="grid gap-1 text-xs text-ink-muted">
            RSS или Atom для поиска публикаций
            <Textarea
              value={feedUrls} className="min-h-[76px]" maxLength={8004} placeholder="По одной HTTPS-ссылке на ленту"
              onChange={(event) => { setFeedUrls(event.target.value); setLinkError(""); }}
            />
          </label>
          {(feedUrls.trim() || useWebSearch) && (
            <label className="grid gap-1 text-xs text-ink-muted">
              {useWebSearch ? "Обновлять поиск" : "Проверять ленты"}
              <select className={selectClass} value={refreshHours ?? ""} onChange={(event) => setRefreshHours(parseRefresh(event.target.value))}>
                {refreshOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          {linkError && <p role="alert" className="text-sm text-danger">{linkError}</p>}
          {mapping.public_url && (
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" className="mt-0.5 accent-accent" checked={fetchCsvUrls}
                onChange={(event) => setFetchCsvUrls(event.target.checked)} />
              Загружать публикации из столбца со ссылками, если в строке нет текста публикации
            </label>
          )}
          <input
            aria-label="Добавить материалы"
            className="block max-w-full text-xs text-ink-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:text-ink"
            type="file"
            multiple
            accept=".pdf,.pptx,.html,.htm,.txt,.md,.srt,.vtt,.wav,.mp3,.m4a,.ogg,.flac,.aac"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length + documents.length > 8 || files.some((file) => file.size > 5 * 1024 * 1024)) {
                setFileError("Допустимо до 8 файлов размером до 5 МБ каждый.");
                return;
              }
              if (files.filter(isAudio).length + documents.filter((item) => isAudio(item.file)).length > 3) {
                setFileError("Допустимо до трёх аудиозаписей.");
                return;
              }
              setFileError("");
              setDocuments([...documents, ...files.map((file) => ({ file, title: "", url: "", date: "", contact: "" }))]);
            }}
          />
          {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
          {documents.map((document, index) => (
            <div key={`${document.file.name}-${index}`} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-2">
              <div className="flex min-w-0 items-center justify-between gap-2 sm:col-span-2">
                <span className="truncate text-sm font-medium">{document.file.name}</span>
                <Button size="sm" variant="ghost" onClick={() => setDocuments(documents.filter((_, position) => position !== index))}>Убрать</Button>
              </div>
              {(["title", "url", "date"] as const).map((field) => (
                <label key={field} className="grid gap-1 text-xs text-ink-muted">
                  {{ title: "Название материала", url: "Ссылка на публикацию", date: "Дата публикации" }[field]}
                  <Input
                    type={field === "title" ? "text" : field}
                    value={document[field]}
                    maxLength={field === "title" ? 300 : 2000}
                    onChange={(event) => setDocuments(documents.map((item, position) =>
                      position === index ? { ...item, [field]: event.target.value } : item))}
                  />
                </label>
              ))}
              {isAudio(document.file) && (
                <label className="grid gap-1 text-xs text-ink-muted">
                  ФИО или ID контакта для записи встречи
                  <Input value={document.contact} maxLength={300} placeholder="Оставьте пустым для публичного выступления"
                    onChange={(event) => setDocuments(documents.map((item, position) =>
                      position === index ? { ...item, contact: event.target.value } : item))}
                  />
                </label>
              )}
            </div>
          ))}
        </section>
        {replacing && <p className="text-xs text-ink-muted">Новый запуск заменит отчёт. Добавьте файлы и ссылки, которые нужны для нового анализа.</p>}
        <Button type="submit" variant="accent" disabled={!mapping.name}>{saving ? "Подготовка данных…" : "Запустить анализ"}</Button>
      </fieldset>
    </form>
  );
}
