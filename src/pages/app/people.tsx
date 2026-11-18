import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Badge, Input, Skeleton } from "@/components/ui/forms";
import { formatNumber, initials } from "@/lib/utils";
import { listWorkspaceContacts, type WorkspaceContact } from "@/services/people";
import { useAuthStore } from "@/stores/auth-store";

const PAGE_SIZE = 50;

type DirectoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; contacts: WorkspaceContact[]; failedTables: number };

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е");
}

const EMPTY_CONTACTS: WorkspaceContact[] = [];

export default function PeoplePage() {
  const workspaceId = useAuthStore((state) => state.workspace?.id);

  if (!workspaceId) {
    return (
      <div className="p-5">
        <h1 className="text-[22px] font-medium tracking-[-0.03em]">Люди</h1>
        <p className="mt-2 text-sm text-ink-muted">Рабочее пространство недоступно.</p>
      </div>
    );
  }

  return <PeopleDirectory key={workspaceId} workspaceId={workspaceId} />;
}

function PeopleDirectory({ workspaceId }: { workspaceId: string }) {
  const [directory, setDirectory] = useState<DirectoryState>({ status: "loading" });
  const [request, setRequest] = useState(0);
  const [query, setQuery] = useState("");
  const [tableId, setTableId] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<WorkspaceContact | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void listWorkspaceContacts(workspaceId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDirectory({ status: "ready", ...result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setDirectory({ status: "error" });
      });
    return () => controller.abort();
  }, [request, workspaceId]);

  const contacts = directory.status === "ready" ? directory.contacts : EMPTY_CONTACTS;
  const sources = useMemo(() => new Map(contacts.map((person) => [person.tableId, person.tableName])), [contacts]);
  const sourceId = sources.has(tableId) ? tableId : "";
  const filtered = useMemo(() => {
    const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
    return contacts.filter((person) => {
      if (sourceId && person.tableId !== sourceId) return false;
      const searchable = normalizeSearch([
        person.name, person.jobTitle, person.decisionRole, person.department, person.company,
        person.city, person.email, person.phone, person.tableName, person.source,
      ].join(" "));
      return terms.every((term) => searchable.includes(term));
    });
  }, [contacts, query, sourceId]);

  const reload = () => {
    setDirectory({ status: "loading" });
    setVisibleCount(PAGE_SIZE);
    setRequest((current) => current + 1);
  };

  const partial = directory.status === "ready" && directory.failedTables > 0;

  return (
    <div className="h-full overflow-auto p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Люди</h1>
          <p className="mt-1 text-[13px] text-ink-muted">Контакты из таблиц вашего рабочего пространства.</p>
        </div>
        <Button asChild variant="secondary" size="sm"><Link to="/app/tables">Мои таблицы</Link></Button>
      </header>

      {contacts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-sm">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              type="search"
              aria-label="Поиск контактов"
              placeholder="Имя, компания, должность или email"
              className="h-9 pl-8"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
            />
          </div>
          {sources.size > 1 && (
            <select
              aria-label="Таблица контактов"
              value={sourceId}
              onChange={(event) => {
                setTableId(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="h-9 max-w-full rounded-[var(--radius-md)] border border-line bg-surface-0 px-2.5 text-[13px]"
            >
              <option value="">Все таблицы</option>
              {Array.from(sources, ([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          <p role="status" className="text-[13px] text-ink-muted">
            Контакты: {formatNumber(filtered.length)}{filtered.length !== contacts.length && ` из ${formatNumber(contacts.length)}`}
          </p>
        </div>
      )}

      <section aria-label="Список контактов" aria-busy={directory.status === "loading"} className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-0">
        {directory.status === "loading" ? (
          <div className="space-y-2 p-3" role="status" aria-label="Загружаем контакты">
            {[1, 2, 3].map((row) => <Skeleton key={row} className="h-10" />)}
          </div>
        ) : directory.status === "error" || (partial && contacts.length === 0) ? (
          <div className="p-8 text-center">
            <p role="alert" className="text-sm font-medium">Не удалось загрузить контакты</p>
            <Button variant="secondary" className="mt-3" onClick={reload}>Повторить</Button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Users aria-hidden="true" className="mx-auto size-7 text-ink-muted" />
            <h2 className="mt-3 text-sm font-medium">Контактов пока нет</h2>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-muted">
              Добавьте контакты в таблицу типа «Люди» с колонкой «Имя» или импортируйте CSV с колонкой «ФИО» либо <code>full_name</code>.
            </p>
            <Button asChild size="sm" className="mt-3"><Link to="/app/tables">Перейти к таблицам</Link></Button>
          </div>
        ) : (
          <>
            {partial && (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-warning-soft px-4 py-2">
                <p role="alert" className="text-[13px]">Часть таблиц не загрузилась. Показаны доступные контакты.</p>
                <Button variant="secondary" size="sm" onClick={reload}>Повторить</Button>
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium">По этому запросу ничего не найдено</p>
                <Button variant="ghost" className="mt-2" onClick={() => { setQuery(""); setTableId(""); }}>
                  Сбросить поиск и фильтр
                </Button>
              </div>
            ) : (
              <ContactList people={filtered.slice(0, visibleCount)} onSelect={setSelected} />
            )}
            {visibleCount < filtered.length && (
              <div className="border-t border-line p-3 text-center">
                <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                  Показать ещё
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} title="Карточка контакта">
        {selected && <ContactDetails person={selected} />}
      </Sheet>
    </div>
  );
}

function ContactList({ people, onSelect }: { people: WorkspaceContact[]; onSelect: (person: WorkspaceContact) => void }) {
  const columns = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)]";

  return (
    <>
      <div aria-hidden="true" className={`hidden gap-3 bg-surface-1 px-4 py-2 text-xs text-ink-muted md:grid ${columns}`}>
        <span>Имя</span>
        <span>Должность и роль</span>
        <span>Компания</span>
        <span>Таблица</span>
      </div>
      <ul className="divide-y divide-line">
        {people.map((person) => (
          <li key={`${person.tableId}/${person.id}`}>
            <button
              type="button"
              className={`grid min-h-12 w-full gap-3 px-4 py-2 text-left text-[13px] hover:bg-row-hover focus-visible:outline-offset-[-3px] md:items-center ${columns}`}
              onClick={() => onSelect(person)}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-xs font-medium">
                  {initials(person.name)}
                </span>
                <span className="min-w-0 break-words">
                  <span className="block font-medium">{person.name}</span>
                  <span className="block text-xs text-ink-muted md:hidden">
                    {[person.jobTitle, person.company, person.decisionRole].filter(Boolean).join(" · ") || person.tableName}
                  </span>
                </span>
              </span>
              <span className="hidden min-w-0 flex-wrap items-center gap-1.5 break-words md:flex">
                {person.jobTitle || (!person.decisionRole && "—")}
                {person.decisionRole && <Badge>{person.decisionRole}</Badge>}
              </span>
              <span className="hidden min-w-0 break-words md:block">{person.company || "—"}</span>
              <span className="hidden min-w-0 break-words text-ink-muted md:block">{person.tableName}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ContactDetails({ person }: { person: WorkspaceContact }) {
  const fields = [
    ["Компания", person.company],
    ["Должность", person.jobTitle],
    ["Роль в решении", person.decisionRole],
    ["Подразделение", person.department],
    ["Город", person.city],
    ["Email", person.email],
    ["Телефон", person.phone],
    ["Источник данных", person.source],
  ];

  return (
    <>
      <h2 className="break-words text-xl font-medium tracking-[-0.025em]">{person.name}</h2>
      <dl className="mt-4 space-y-3 text-[13px]">
        {fields.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-2">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-2 border-t border-line pt-3">
          <dt className="text-ink-muted">Таблица</dt>
          <dd className="break-words">{person.tableName}</dd>
        </div>
      </dl>
      <Button asChild variant="secondary" className="mt-4">
        <Link to={`/app/tables/${person.tableId}`}>Открыть таблицу <ArrowUpRight aria-hidden="true" /></Link>
      </Button>
    </>
  );
}
