import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CircleHelp, Clock3, GitBranch, List, Map as MapIcon, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/forms";
import { useAuthStore } from "@/stores/auth-store";
import { edgeNames, roleNames, stanceNames } from "./graph-labels";
import { StakeholderGraph } from "./stakeholder-graph";
import { stakeholderRepository, type Confidence, type InteractionType, type RelationshipType, type StakeholderAccount, type StakeholderContact, type StakeholderEdge, type StakeholderInteraction, type StakeholderPosition, type StakeholderRole, type StakeholderSnapshot, type SyncPreview } from "./repository";

const interactionNames: Record<InteractionType, string> = { meeting: "Встреча", call: "Звонок", email: "Письмо", event: "Событие", note: "Заметка" };
const roleOptions = Object.keys(roleNames) as StakeholderRole[];
const stanceOptions = Object.keys(stanceNames) as StakeholderPosition[];
const departments = ["Бизнес", "ИТ", "Информационная безопасность", "Финансы", "Закупки"];
const EMPTY_CONTACTS: StakeholderContact[] = [];
const DATE_ANCHOR = Date.now();
const dateLabel = (date?: string | null) => date ? new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "Неизвестно";
const initials = (name: string) => name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-[11px] text-ink-muted">{label}</span>{children}</label>;
}

export default function StakeholderMapPage() {
  const { companyId = "" } = useParams();
  const navigate = useNavigate();
  const isReadOnly = useAuthStore((state) => state.workspace?.role === "viewer");
  const signedInUser = useAuthStore((state) => state.user);
  const interactionAuthor = signedInUser?.name || signedInUser?.email || "Менеджер Sammi";
  const [accounts, setAccounts] = useState<StakeholderAccount[]>([]);
  const [snapshot, setSnapshot] = useState<StakeholderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<"graph" | "list">(() => typeof window !== "undefined" && window.innerWidth < 768 ? "list" : "graph");
  const [layer, setLayer] = useState<"all" | "structure" | "influence">("all");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [role, setRole] = useState("all");
  const [stance, setStance] = useState("all");
  const [freshness, setFreshness] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "links" | "history" | "sources">("overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"edge" | "interaction" | "sync" | "path" | "timeline" | null>(null);
  const [edgeToEdit, setEdgeToEdit] = useState<StakeholderEdge | null>(null);
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [pathTarget, setPathTarget] = useState("");
  const [pathResult, setPathResult] = useState<string[] | null | false>(null);
  const [periodDays, setPeriodDays] = useState(90);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [list, data] = await Promise.all([stakeholderRepository.listAccounts(), stakeholderRepository.getSnapshot(companyId)]);
      setAccounts(list); setSnapshot(data); setSelectedId((current) => data.contacts.some((contact) => contact.id === current) ? current : data.contacts[0]?.id ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить карту."); }
    finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const contacts = snapshot?.contacts ?? EMPTY_CONTACTS;
  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;
  const account = accounts.find((item) => item.id === companyId) ?? snapshot?.account;
  const filtered = useMemo(() => contacts.filter((contact) => {
    const text = `${contact.name} ${contact.title} ${contact.department}`.toLocaleLowerCase("ru");
    return (!query || text.includes(query.toLocaleLowerCase("ru"))) &&
      (department === "all" || contact.department === department) &&
      (role === "all" || contact.role === role) &&
      (stance === "all" || contact.stance === stance) &&
      (freshness === "all" || (freshness === "stale" ? contact.stale : !contact.stale));
  }), [contacts, query, department, role, stance, freshness]);
  const visibleEdges = useMemo(() => {
    const ids = new Set(filtered.map((contact) => contact.id));
    return (snapshot?.edges ?? []).filter((edge) => {
      if (!ids.has(edge.fromId) || !ids.has(edge.toId)) return false;
      if (layer === "structure") return edge.type === "reports_to" || edge.type === "collaborates_with";
      if (layer === "influence") return edge.type === "influences" || edge.type === "introduced_by";
      return true;
    });
  }, [filtered, layer, snapshot?.edges]);
  const periodCutoff = DATE_ANCHOR - periodDays * 86400000;
  const activeContacts = contacts.filter((contact) => contact.lastInteractionAt && new Date(contact.lastInteractionAt).getTime() >= periodCutoff).length;
  const departmentGaps = departments.filter((name) => !contacts.some((contact) => contact.department === name && contact.role !== "unknown" && contact.lastInteractionAt && new Date(contact.lastInteractionAt).getTime() >= periodCutoff));
  const staleCount = contacts.filter((contact) => !contact.lastInteractionAt || new Date(contact.lastInteractionAt).getTime() < periodCutoff).length;
  const thinEvidence = (snapshot?.edges ?? []).filter((edge) => edge.confidence !== "verified").length;
  const activeFilterCount = [department, role, stance, freshness, view === "graph" ? layer : "all"]
    .filter((filter) => filter !== "all").length;

  const resetFilters = () => {
    setQuery("");
    setDepartment("all");
    setRole("all");
    setStance("all");
    setFreshness("all");
    setLayer("all");
  };

  const selectContact = (id: string) => {
    setSelectedId(id);
    setEditing(false);
    setTab("overview");
  };

  const saveContact = async (patch: Partial<StakeholderContact>) => {
    if (!snapshot || !selected) return;
    setSaving(true); setNotice("");
    try { await stakeholderRepository.updateContact(companyId, selected.id, patch); await load(); setEditing(false); setNotice("Изменения сохранены в локальном демо."); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Не удалось сохранить изменения."); }
    finally { setSaving(false); }
  };
  const showSync = async () => { if (!snapshot) return; setSyncPreview(await stakeholderRepository.getSyncPreview(companyId)); setModal("sync"); };
  const openCreateEdge = () => { setEdgeToEdit(null); setModal("edge"); };
  const applyDemoSync = async () => {
    try { await stakeholderRepository.applySync(companyId); setSyncPreview(await stakeholderRepository.getSyncPreview(companyId)); setNotice("Изменения применены к локальной копии mock CRM в этом браузере."); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Не удалось обновить локальную копию mock CRM."); }
  };
  const resetDemo = async () => { if (!snapshot || !window.confirm("Сбросить локальные изменения этого демо-клиента?")) return; await stakeholderRepository.reset(companyId); await load(); setNotice("Демо-клиент восстановлен из исходного набора."); };

  if (loading) return <div className="h-full space-y-4 overflow-auto p-6"><div className="h-6 w-64 animate-pulse rounded bg-surface-2"/><div className="h-14 animate-pulse rounded bg-surface-1"/><div className="h-[62vh] animate-pulse rounded bg-surface-1"/></div>;
  if (error || !snapshot || !account) return <div className="grid h-full place-items-center p-6"><div className="max-w-md text-center"><CircleHelp className="mx-auto mb-3 size-8 text-ink-muted"/><h1 className="text-lg font-medium">{error ? "Не удалось открыть карту" : "Компания не найдена"}</h1><p className="mt-2 text-sm text-ink-muted">{error || "Проверьте адрес или выберите демонстрационную компанию."}</p><div className="mt-4 flex justify-center gap-2"><Button variant="secondary" onClick={() => void load()}>Повторить</Button><Button asChild><Link to="/app/companies">К компаниям</Link></Button></div></div></div>;

  return <div className="stakeholder-page flex h-full min-h-0 flex-col overflow-hidden">
    <header className="shrink-0 border-b border-line bg-surface-0 px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><div className="mb-1 flex items-center gap-2 text-[12px] text-ink-muted"><Link to="/app/companies" className="hover:text-ink">Компании</Link><span>/</span><span className="truncate">{account.name}</span><span>/</span><span className="text-ink">Карта ЛПР</span></div><h1 className="truncate text-[20px] font-medium tracking-[-0.025em]">{account.name}</h1></div>
        <div className="flex items-center gap-2"><label className="sr-only" htmlFor="stakeholder-account">Клиент</label><select id="stakeholder-account" className="h-8 max-w-[190px] rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]" value={companyId} onChange={(event) => navigate(`/app/companies/${event.target.value}/stakeholders`)}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-[11px] text-warning">Демо</span><button onClick={() => void showSync()} className="h-8 rounded-[var(--radius-sm)] border border-line px-2.5 text-[12px] hover:bg-surface-1">Источник данных</button><span className="hidden text-[11px] text-ink-muted sm:inline">Обновлено {dateLabel(snapshot.fetchedAt)}</span></div>
      </div>
    </header>
    <div className="shrink-0 space-y-3 border-b border-line bg-surface-0 px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 md:max-w-[320px]"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint"/><Input aria-label="Поиск людей" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, должность или отдел" className="pl-8"/></div>
        <div className="flex rounded-[var(--radius-sm)] border border-line p-0.5"><button onClick={() => setView("graph")} aria-pressed={view === "graph"} className={`flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-[12px] ${view === "graph" ? "bg-surface-2 text-ink" : "text-ink-muted"}`}><MapIcon className="size-3.5"/>Граф</button><button onClick={() => setView("list")} aria-pressed={view === "list"} className={`flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-[12px] ${view === "list" ? "bg-surface-2 text-ink" : "text-ink-muted"}`}><List className="size-3.5"/>Список</button></div>
        {!isReadOnly && <><button className="h-8 rounded-[var(--radius-sm)] border border-line px-2.5 text-[12px] hover:bg-surface-1" onClick={openCreateEdge}>Добавить связь</button>
        <button className="h-8 rounded-[var(--radius-sm)] bg-primary px-2.5 text-[12px] text-primary-foreground hover:opacity-90" onClick={() => { if (selected) setModal("interaction"); else setNotice("Сначала выберите контакт."); }}>Зафиксировать встречу</button></>}
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-line px-2.5 text-xs sm:hidden"
        aria-expanded={filtersOpen}
        aria-controls="stakeholder-filters"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        <SlidersHorizontal aria-hidden="true" className="size-3.5" />
        Фильтры{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
      </button>
      <div id="stakeholder-filters" className={`${filtersOpen ? "flex" : "hidden sm:flex"} flex-wrap items-center gap-2`}>
        <label className="sr-only" htmlFor="department-filter">Подразделение</label><select id="department-filter" className="h-8 max-w-[190px] rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]" value={department} onChange={(e) => setDepartment(e.target.value)}><option value="all">Все подразделения</option>{departments.map((item) => <option key={item}>{item}</option>)}</select>
        <label className="sr-only" htmlFor="role-filter">Роль в решении</label><select id="role-filter" className="h-8 max-w-[190px] rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]" value={role} onChange={(e) => setRole(e.target.value)}><option value="all">Все роли</option>{roleOptions.map((item) => <option key={item} value={item}>{roleNames[item]}</option>)}</select>
        <label className="sr-only" htmlFor="stance-filter">Отношение</label><select id="stance-filter" className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]" value={stance} onChange={(e) => setStance(e.target.value)}><option value="all">Любая оценка</option>{stanceOptions.map((item) => <option key={item} value={item}>{stanceNames[item]}</option>)}</select>
        <label className="sr-only" htmlFor="freshness-filter">Свежесть данных</label><select id="freshness-filter" className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]" value={freshness} onChange={(e) => setFreshness(e.target.value)}><option value="all">Любая свежесть</option><option value="fresh">Недавно на связи</option><option value="stale">Давно не общались</option></select>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {view === "graph" && (
            <select
              aria-label="Тип связей"
              className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]"
              value={layer}
              onChange={(event) => setLayer(event.target.value as typeof layer)}
            >
              <option value="all">Все связи</option>
              <option value="structure">Оргструктура</option>
              <option value="influence">Влияние и знакомства</option>
            </select>
          )}
          <button onClick={resetFilters} className="flex h-8 items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
            <RotateCcw aria-hidden="true" className="size-3.5" />Сбросить
          </button>
        </div>
      </div>
    </div>
    <div className="stakeholder-body min-h-0 flex-1">
      <div className="stakeholder-layout grid min-h-0 grid-cols-1 lg:h-full lg:grid-cols-[minmax(0,1fr)_350px]">
        <section className="flex min-h-0 flex-col">
          {filtered.length === 0 ? <EmptyFilter onReset={resetFilters} /> : view === "graph" ? (
            <StakeholderGraph
              key={JSON.stringify(filtered.map((contact) => contact.id))}
              accountName={account.name}
              contacts={filtered}
              totalContacts={contacts.length}
              edges={visibleEdges}
              departments={departments}
              selectedId={selectedId}
              onSelect={selectContact}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto p-3 md:p-5">
              <ContactList contacts={filtered} selectedId={selectedId} onSelect={selectContact} />
            </div>
          )}
        </section>
        <aside className="stakeholder-detail min-h-0 overflow-auto border-t border-line bg-surface-0 lg:border-l lg:border-t-0">
          {selected ? <ContactDetail contact={selected} allContacts={contacts} edges={snapshot.edges} events={snapshot.interactions.filter((event) => event.contactIds.includes(selected.id))} tab={tab} setTab={setTab} editing={editing} setEditing={setEditing} saveContact={saveContact} saving={saving} notice={notice} readOnly={isReadOnly} onAddInteraction={() => setModal("interaction")} onAddEdge={openCreateEdge} onEditEdge={(edge) => { setEdgeToEdit(edge); setModal("edge"); }} onSelectContact={setSelectedId} /> : <div className="p-6 text-sm text-ink-muted">Выберите участника карты.</div>}
        </aside>
      </div>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-0 px-4 py-2 text-[10px] text-ink-muted md:px-5"><span>{account.industry} · {contacts.length} участников</span><span className="hidden sm:inline">Демо-данные вымышлены; изменения хранятся в этом браузере.</span><button onClick={() => setModal("timeline")} className="ml-auto flex items-center gap-1 hover:text-ink"><Clock3 className="size-3"/>Активность и риски</button>{!isReadOnly && <button onClick={() => void resetDemo()} className="hover:text-ink">Сбросить демо</button>}</footer>
    {notice && <div role="status" className="fixed bottom-14 left-1/2 z-30 -translate-x-1/2 rounded bg-primary px-3 py-2 text-[12px] text-primary-foreground">{notice}</div>}
    {modal && <Modal title={modal === "edge" ? edgeToEdit ? "Изменить связь" : "Добавить связь" : modal === "interaction" ? "Зафиксировать взаимодействие" : modal === "sync" ? "Источник данных и обмен" : modal === "path" ? "Путь знакомства" : "Покрытие и активность"} onClose={() => { setModal(null); setEdgeToEdit(null); }}>
      {modal === "edge" && <EdgeForm accountId={companyId} contacts={contacts} selectedId={selectedId} initialEdge={edgeToEdit} onCancel={() => { setModal(null); setEdgeToEdit(null); }} onSave={async (input) => { if (edgeToEdit) await stakeholderRepository.updateEdge(companyId, edgeToEdit.id, input); else await stakeholderRepository.createEdge(companyId, input); await load(); setModal(null); setEdgeToEdit(null); setNotice("Связь сохранена в локальном демо."); }} />}
      {modal === "interaction" && <InteractionForm accountId={companyId} contacts={contacts} selectedId={selectedId} authorName={interactionAuthor} onCancel={() => setModal(null)} onSave={async (input) => { await stakeholderRepository.addInteraction(companyId, input); await load(); setModal(null); setNotice("Взаимодействие сохранено в локальном демо."); }} />}
      {modal === "sync" && syncPreview && <div className="space-y-5"><div className="rounded bg-warning-soft p-3 text-[12px] text-warning">Демо-обмен работает между локальной картой и локальной копией mock CRM в этом браузере. Реальная CRM и PostgreSQL не вызываются.</div><PreviewSection title="Получено из mock CRM" items={syncPreview.received}/><PreviewSection title="Добавлено в карте" items={syncPreview.local}/><div><h3 className="mb-2 text-[13px] font-medium">План передачи обратно · {syncPreview.outbound.length}</h3>{syncPreview.outbound.length ? <ul className="space-y-2">{syncPreview.outbound.map((entry, i) => <li key={`${entry.entity}-${i}`} className="rounded border border-line p-2.5 text-[12px]"><b>{entry.entity}</b><div className="mt-1 text-ink-muted">{entry.description}</div><div className="mt-1 text-[10px] text-warning">Ожидает применения в локальный mock CRM</div></li>)}</ul> : <p className="text-[12px] text-ink-muted">Исходящих изменений нет.</p>}</div><p className="text-[10px] text-ink-muted">Локальный mock-снимок: {dateLabel(syncPreview.appliedAt)}</p><div className="flex justify-end gap-2">{!isReadOnly && syncPreview.outbound.length > 0 && <Button onClick={() => void applyDemoSync()}>Применить в локальный mock CRM</Button>}<Button variant="secondary" onClick={() => setModal(null)}>Закрыть</Button></div></div>}
      {modal === "path" && <PathForm contacts={contacts} selectedId={selectedId} target={pathTarget} setTarget={setPathTarget} result={pathResult} onFind={() => setPathResult(findVerifiedPath(contacts, snapshot.edges, selectedId, pathTarget))}/>} 
      {modal === "timeline" && <div className="space-y-4"><div className="flex gap-2">{[30, 90, 180].map((days) => <button key={days} onClick={() => setPeriodDays(days)} className={`rounded border px-3 py-2 text-[12px] ${periodDays === days ? "bg-accent-soft text-accent" : "border-line"}`}>{days} дней</button>)}</div><div className="grid grid-cols-2 gap-3">{[["Подтверждённые участники", contacts.filter((c) => c.role !== "unknown").length], [`Нет контакта за ${periodDays} дней`, staleCount], [`Были на связи за ${periodDays} дней`, activeContacts], ["Подразделения без активного контакта", departmentGaps.length], ["Связи требуют проверки", thinEvidence]].map(([label, value]) => <div key={label} className="rounded bg-surface-1 p-3"><div className="text-[20px] font-medium font-mono-data">{value}</div><div className="mt-1 text-[11px] text-ink-muted">{label}</div></div>)}</div><p className="text-[11px] text-ink-muted">Расчёт по демонстрационному набору на период {periodDays} дней. Активность и пробелы считаются относительно выбранного периода; число относится к текущему набору, а не к CRM.</p><div className="space-y-2"><h3 className="text-[13px] font-medium">Подразделения с пробелом связи</h3>{departmentGaps.map((item) => <button key={item} onClick={() => { setDepartment(item); setModal(null); }} className="block text-left text-[12px] text-accent hover:underline">{item} — нет свежего подтверждённого контакта</button>)}</div><div className="space-y-2"><h3 className="text-[13px] font-medium">Недавние взаимодействия</h3>{snapshot.interactions.filter((event) => new Date(event.occurredAt).getTime() >= periodCutoff).slice(0, 5).map((event) => <button key={event.id} onClick={() => { setSelectedId(event.contactIds[0]); setTab("history"); setModal(null); }} className="block w-full rounded bg-surface-1 p-2 text-left"><span className="text-[10px] text-ink-muted">{dateLabel(event.occurredAt)} · {interactionNames[event.type]}</span><span className="block text-[11px]">{event.summary}</span></button>)}</div><div className="flex gap-2"><select className="h-9 flex-1 rounded border border-line bg-surface-0 px-2 text-[12px]" value={pathTarget} onChange={(e) => setPathTarget(e.target.value)}><option value="">Целевой участник для пути</option>{contacts.filter((c) => c.id !== selectedId).map((c) => <option key={c.id} value={c.id}>{c.name} · {roleNames[c.role]}</option>)}</select><Button variant="secondary" onClick={() => { setModal("path"); setPathResult(null); }}>Найти подтверждённый путь</Button></div></div>}
    </Modal>}
  </div>;
}

function EmptyFilter({ onReset }: { onReset: () => void }) { return <div className="grid h-full min-h-[280px] place-items-center p-6 text-center"><div><Search className="mx-auto mb-3 size-7 text-ink-faint"/><div className="text-sm font-medium">По условиям ничего не найдено</div><button onClick={onReset} className="mt-2 text-[12px] text-accent underline">Сбросить фильтры</button></div></div>; }
function ContactList({ contacts, selectedId, onSelect }: { contacts: StakeholderContact[]; selectedId: string; onSelect: (id: string) => void }) { return <div className="overflow-x-auto rounded border border-line"><table className="w-full min-w-[780px] text-left text-[12px]"><thead className="bg-surface-1 text-ink-muted"><tr>{["Контакт", "Отдел", "Роль", "Влияние", "Позиция", "Последний контакт", "Источник"].map((item) => <th key={item} className="px-3 py-2 font-medium">{item}</th>)}</tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onSelect(contact.id); }} onClick={() => onSelect(contact.id)} className={`cursor-pointer border-t border-line hover:bg-row-hover ${selectedId === contact.id ? "bg-row-selected" : ""}`}><td className="px-3 py-2"><div className="font-medium">{contact.name}</div><div className="text-[10px] text-ink-muted">{contact.title}</div></td><td className="px-3 py-2">{contact.department}</td><td className="px-3 py-2">{roleNames[contact.role]}</td><td className="px-3 py-2">{contact.influence ? `${contact.influence}/5` : "Неизвестно"}</td><td className="px-3 py-2">{stanceNames[contact.stance]}</td><td className="px-3 py-2">{dateLabel(contact.lastInteractionAt)}</td><td className="px-3 py-2 text-ink-muted">{contact.source}</td></tr>)}</tbody></table></div>; }
function ContactDetail({ contact, allContacts, edges, events, tab, setTab, editing, setEditing, saveContact, saving, notice, onAddInteraction, onAddEdge, onEditEdge, onSelectContact, readOnly }: { contact: StakeholderContact; allContacts: StakeholderContact[]; edges: StakeholderEdge[]; events: StakeholderInteraction[]; tab: "overview" | "links" | "history" | "sources"; setTab: (tab: "overview" | "links" | "history" | "sources") => void; editing: boolean; setEditing: (value: boolean) => void; saveContact: (patch: Partial<StakeholderContact>) => Promise<void>; saving: boolean; notice: string; readOnly: boolean; onAddInteraction: () => void; onAddEdge: () => void; onEditEdge: (edge: StakeholderEdge) => void; onSelectContact: (id: string) => void }) {
  const links = edges.filter((edge) => edge.fromId === contact.id || edge.toId === contact.id);
  return <div className="min-h-full">
    <div className="border-b border-line p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-medium text-accent">{initials(contact.name)}</span><h2 className="truncate text-[15px] font-medium">{contact.name}</h2></div><p className="mt-2 text-[12px] text-ink-muted">{contact.title} · {contact.department}</p><p className="mt-1 text-[11px] text-ink-faint">Источник: {contact.source}</p></div>{!readOnly && <button aria-label="Редактировать контакт" onClick={() => setEditing(!editing)} className="h-8 rounded border border-line px-2 text-[11px]">{editing ? "Отмена" : "Редактировать"}</button>}</div>
      <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded bg-surface-1 px-2 py-1 text-[10px]">{roleNames[contact.role]}</span><span className="rounded bg-surface-1 px-2 py-1 text-[10px]">{stanceNames[contact.stance]}</span><span className="rounded bg-surface-1 px-2 py-1 text-[10px]">Влияние {contact.influence ?? "неизвестно"}/5</span></div>
    </div>
    <div className="grid grid-cols-4 border-b border-line">{([["overview", "Обзор"], ["links", "Связи"], ["history", "История"], ["sources", "Источники"]] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`h-10 border-b-2 text-[11px] ${tab === value ? "border-accent text-ink" : "border-transparent text-ink-muted"}`}>{label}</button>)}</div>
    <div className="space-y-4 p-4">
      {editing && <ContactEdit contact={contact} saving={saving} onSave={saveContact} onCancel={() => setEditing(false)}/>}
      {!editing && tab === "overview" && <><InfoRow label="Роль в решении" value={roleNames[contact.role]}/><InfoRow label="Влияние" value={contact.influence ? `${contact.influence} из 5` : "Неизвестно"}/><InfoRow label="Позиция к инициативе" value={stanceNames[contact.stance]}/><InfoRow label="Сила отношений с нами" value={contact.relationshipStrength ? `${contact.relationshipStrength} из 5` : "Неизвестно"}/><InfoRow label="Последний контакт" value={dateLabel(contact.lastInteractionAt)}/><InfoRow label="Дата проверки" value={dateLabel(contact.verifiedAt)}/><div className="rounded bg-surface-1 p-3 text-[11px] text-ink-muted">{contact.relationshipEvidence}</div>{!readOnly && <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={onAddEdge}>Добавить связь</Button><Button onClick={onAddInteraction}>Записать встречу</Button></div>}</>}
      {!editing && tab === "links" && <><div className="flex items-center justify-between"><span className="text-[12px] text-ink-muted">Связи этого участника · {links.length}</span>{!readOnly && <button onClick={onAddEdge} className="text-[11px] text-accent">Добавить</button>}</div>{links.map((edge) => { const otherId = edge.fromId === contact.id ? edge.toId : edge.fromId; const other = allContacts.find((item) => item.id === otherId); return <div key={edge.id} className="rounded border border-line p-3"><button onClick={() => onSelectContact(otherId)} className="w-full text-left hover:text-accent"><div className="flex justify-between gap-2 text-[12px]"><span className="font-medium">{other?.name ?? "Контакт"}</span><span className="text-ink-muted">{edgeNames[edge.type]}</span></div></button><div className="mt-1 text-[10px] text-ink-muted">Сила {edge.strength ?? "неизвестна"}/5 · {edge.confidence === "verified" ? "Подтверждено" : "Требует проверки"}</div><div className="mt-1 text-[10px] text-ink-faint">{edge.evidence}</div>{!readOnly && <button onClick={() => onEditEdge(edge)} className="mt-2 text-[11px] text-accent">Изменить связь</button>}</div>})}{links.length === 0 && <p className="text-[12px] text-ink-muted">Связи не указаны.</p>}</>}
      {!editing && tab === "history" && <><div className="flex items-center justify-between"><span className="text-[12px] text-ink-muted">События · {events.length}</span>{!readOnly && <button onClick={onAddInteraction} className="text-[11px] text-accent">Добавить</button>}</div>{events.sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)).map((event) => <div key={event.id} className="border-l-2 border-accent pl-3"><div className="flex justify-between gap-2 text-[11px]"><span className="font-medium">{interactionNames[event.type]}</span><span className="text-ink-muted">{dateLabel(event.occurredAt)}</span></div><p className="mt-1 text-[12px]">{event.summary}</p><div className="mt-1 text-[10px] text-ink-muted">{event.authorName} · {event.source}</div></div>)}{events.length === 0 && <p className="text-[12px] text-ink-muted">Истории пока нет.</p>}</>}
      {!editing && tab === "sources" && <><InfoRow label="Источник контакта" value="Mock CRM · вымышленные данные"/><InfoRow label="Оценки" value="Суждение менеджера, не поле CRM"/><InfoRow label="Обновлено" value={dateLabel(contact.verifiedAt)}/><InfoRow label="Подтверждение связи" value={contact.verifiedAt ? "Проверено вручную" : "Нет подтверждения"}/><p className="rounded bg-warning-soft p-3 text-[11px] text-warning">Для реальной синхронизации потребуется backend-контракт и подключение CRM. Сейчас изменения сохраняются только в браузере.</p></>}
    </div>
    {notice && <div role="status" className="px-4 pb-4 text-[11px] text-ink-muted">{notice}</div>}
  </div>;
}
function ContactEdit({ contact, saving, onSave, onCancel }: { contact: StakeholderContact; saving: boolean; onSave: (patch: Partial<StakeholderContact>) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(contact.name); const [role, setRole] = useState(contact.role); const [stance, setStance] = useState(contact.stance); const [evaluatedAt, setEvaluatedAt] = useState(new Date(contact.verifiedAt ?? DATE_ANCHOR).toISOString().slice(0, 10)); const [influence, setInfluence] = useState(contact.influence?.toString() ?? ""); const [strength, setStrength] = useState(contact.relationshipStrength?.toString() ?? ""); const [title, setTitle] = useState(contact.title); const [department, setDepartment] = useState(contact.department); const [evidence, setEvidence] = useState(contact.relationshipEvidence);
  return <form className="space-y-3 rounded border border-line p-3" onSubmit={(event) => { event.preventDefault(); void onSave({ name, role, stance, influence: influence ? Number(influence) : null, relationshipStrength: strength ? Number(strength) : null, title, department, relationshipEvidence: evidence, verifiedAt: new Date(`${evaluatedAt}T12:00:00.000Z`).toISOString() }); }}><div className="text-[12px] font-medium">Изменить контакт и оценку</div><Field label="Имя"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Должность"><Input value={title} onChange={(e) => setTitle(e.target.value)}/></Field><Field label="Подразделение"><select className="h-8 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={department} onChange={(e) => setDepartment(e.target.value)}>{departments.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Роль в решении"><select className="h-8 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={role} onChange={(e) => setRole(e.target.value as StakeholderRole)}>{roleOptions.map((item) => <option key={item} value={item}>{roleNames[item]}</option>)}</select></Field><div className="grid grid-cols-2 gap-2"><Field label="Влияние 1–5"><select className="h-8 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={influence} onChange={(e) => setInfluence(e.target.value)}><option value="">Неизвестно</option>{[1,2,3,4,5].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Позиция"><select className="h-8 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={stance} onChange={(e) => setStance(e.target.value as StakeholderPosition)}>{stanceOptions.map((item) => <option key={item} value={item}>{stanceNames[item]}</option>)}</select></Field></div><Field label="Сила отношений 1–5"><select className="h-8 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={strength} onChange={(e) => setStrength(e.target.value)}><option value="">Неизвестно</option>{[1,2,3,4,5].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Дата оценки"><Input type="date" value={evaluatedAt} onChange={(e) => setEvaluatedAt(e.target.value)} required /></Field><Field label="Основание оценки"><Textarea className="min-h-[72px]" value={evidence} onChange={(e) => setEvidence(e.target.value)}/></Field><div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Отмена</Button><Button disabled={saving}>{saving ? "Сохранение…" : "Сохранить"}</Button></div></form>;
}
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-3"><span className="text-[11px] text-ink-muted">{label}</span><span className="max-w-[60%] text-right text-[11px]">{value}</span></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-[520px] overflow-auto rounded-[var(--radius-md)] border border-line bg-surface-0 p-4 shadow-[var(--shadow-float)]"><div className="mb-4 flex items-center justify-between"><h2 className="text-[15px] font-medium">{title}</h2><button onClick={onClose} aria-label="Закрыть" className="flex size-9 items-center justify-center rounded hover:bg-surface-1"><X className="size-4"/></button></div>{children}</section></div>; }
function EdgeForm({ accountId, contacts, selectedId, initialEdge, onCancel, onSave }: { accountId: string; contacts: StakeholderContact[]; selectedId: string; initialEdge: StakeholderEdge | null; onCancel: () => void; onSave: (input: Omit<StakeholderEdge, "id">) => Promise<void> }) { const [fromId,setFrom]=useState(initialEdge?.fromId ?? selectedId); const [toId,setTo]=useState(initialEdge?.toId ?? ""); const [type,setType]=useState<RelationshipType>(initialEdge?.type ?? "influences"); const [strength,setStrength]=useState(initialEdge?.strength?.toString() ?? "3"); const [confidence,setConfidence]=useState<Confidence>(initialEdge?.confidence ?? "verified"); const [evidence,setEvidence]=useState(initialEdge?.evidence ?? ""); const [error,setError]=useState(""); const [saving,setSaving]=useState(false); return <form className="space-y-3" onSubmit={async(e)=>{e.preventDefault();setSaving(true);setError("");try{await onSave({accountId,fromId,toId,type,strength:Number(strength),confidence,evidence:evidence.trim()||"Добавлено вручную",updatedAt:new Date().toISOString()});}catch(reason){setError(reason instanceof Error?reason.message:"Не удалось сохранить связь.");}finally{setSaving(false);}}}><Field label="От кого"><select className="h-9 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={fromId} onChange={(e)=>setFrom(e.target.value)}>{contacts.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="К кому"><select required className="h-9 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={toId} onChange={(e)=>setTo(e.target.value)}><option value="">Выберите участника</option>{contacts.filter((c)=>c.id!==fromId).map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Тип связи"><select className="h-9 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={type} onChange={(e)=>setType(e.target.value as RelationshipType)}>{Object.entries(edgeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><div className="grid grid-cols-2 gap-2"><Field label="Сила 1–5"><select className="h-9 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={strength} onChange={(e)=>setStrength(e.target.value)}>{[1,2,3,4,5].map((v)=><option key={v}>{v}</option>)}</select></Field><Field label="Уверенность"><select className="h-9 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={confidence} onChange={(e)=>setConfidence(e.target.value as Confidence)}><option value="verified">Подтверждена</option><option value="inferred">Предположение</option><option value="unknown">Неизвестно</option></select></Field></div><Field label="Основание"><Input value={evidence} onChange={(e)=>setEvidence(e.target.value)} placeholder="Кто и когда подтвердил"/></Field>{error&&<p role="alert" className="text-[12px] text-danger">{error}</p>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Отмена</Button><Button disabled={saving||!toId}>{saving?"Сохранение…":initialEdge?"Сохранить изменения":"Сохранить связь"}</Button></div></form>; }
function InteractionForm({ accountId, contacts, selectedId, authorName, onCancel, onSave }: { accountId: string; contacts: StakeholderContact[]; selectedId: string; authorName: string; onCancel: () => void; onSave: (input: Omit<StakeholderInteraction, "id">) => Promise<void> }) { const [selectedContacts,setSelectedContacts]=useState<string[]>(selectedId?[selectedId]:[]);const [type,setType]=useState<InteractionType>("meeting");const [date,setDate]=useState(new Date().toISOString().slice(0,16));const [summary,setSummary]=useState("");const [error,setError]=useState("");const [saving,setSaving]=useState(false);return <form className="space-y-3" onSubmit={async(e)=>{e.preventDefault();setSaving(true);setError("");try{await onSave({accountId,contactIds:selectedContacts,type,occurredAt:new Date(date).toISOString(),summary,authorName,source:"Локальное демо · добавлено вручную"});}catch(reason){setError(reason instanceof Error?reason.message:"Не удалось сохранить событие.");}finally{setSaving(false);}}}><Field label="Участники"><select multiple className="h-28 w-full rounded border border-line bg-surface-0 p-2 text-[12px]" value={selectedContacts} onChange={(e)=>setSelectedContacts(Array.from(e.target.selectedOptions).map((o)=>o.value))}>{contacts.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Тип"><select className="h-9 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={type} onChange={(e)=>setType(e.target.value as InteractionType)}>{Object.entries(interactionNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><Field label="Дата и время"><Input type="datetime-local" value={date} onChange={(e)=>setDate(e.target.value)} required/></Field><Field label="Краткое содержание"><Textarea value={summary} onChange={(e)=>setSummary(e.target.value)} placeholder="О чём договорились, следующий шаг" required/></Field>{error&&<p role="alert" className="text-[12px] text-danger">{error}</p>}<p className="text-[10px] text-ink-muted">Автор: {authorName} · локальное демо</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Отмена</Button><Button disabled={saving||!selectedContacts.length||!summary.trim()}>{saving?"Сохранение…":"Сохранить событие"}</Button></div></form>; }
function PreviewSection({ title, items }: { title: string; items: string[] }) { return <div><h3 className="mb-2 text-[13px] font-medium">{title}</h3><ul className="space-y-1.5">{items.map((item)=><li key={item} className="flex gap-2 text-[12px] text-ink-muted"><span className="text-accent">·</span>{item}</li>)}</ul></div>; }
function findVerifiedPath(contacts: StakeholderContact[], edges: StakeholderEdge[], start: string, target: string) { if (!start || !target) return null; const queue: string[]=[start];const previous=new Map<string,string|null>([[start,null]]);while(queue.length){const current=queue.shift()!;if(current===target)break;for(const edge of edges.filter((item)=>item.confidence==="verified"&&(item.type==="introduced_by"||item.type==="influences"||item.type==="collaborates_with"))){const next=edge.fromId===current?edge.toId:edge.toId===current?edge.fromId:null;if(next&&!previous.has(next)){previous.set(next,current);queue.push(next);}}}if(!previous.has(target))return false;const path:string[]=[];let current:string|null=target;while(current){path.unshift(current);current=previous.get(current)??null;}return path.map((id)=>contacts.find((item)=>item.id===id)?.name??id); }
function PathForm({ contacts, selectedId, target, setTarget, result, onFind }: { contacts: StakeholderContact[]; selectedId: string; target: string; setTarget: (value: string) => void; result: string[] | null | false; onFind: () => void }) { return <div className="space-y-4"><p className="text-[12px] text-ink-muted">Маршрут строится только по подтверждённым влияниям, сотрудничеству и цепочкам знакомства.</p><Field label="Целевой участник"><select className="h-9 w-full rounded border border-line bg-surface-0 px-2 text-[12px]" value={target} onChange={(e)=>setTarget(e.target.value)}><option value="">Выберите человека</option>{contacts.filter((item)=>item.id!==selectedId).map((item)=><option key={item.id} value={item.id}>{item.name} · {roleNames[item.role]}</option>)}</select></Field><Button disabled={!target} onClick={onFind}>Найти путь</Button>{result&&<div className="space-y-2 rounded bg-surface-1 p-3">{result.length===1?<p className="text-[12px]">Выбран один участник.</p>:result.map((name,index)=><div key={`${name}-${index}`} className="flex items-center gap-2 text-[12px]"><span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-[10px] text-accent">{index+1}</span>{name}{index<result.length-1&&<GitBranch className="size-3 text-ink-faint"/>}</div>)}</div>}{result===null&&target&&<p className="text-[12px] text-ink-muted">Нажмите «Найти путь», чтобы проверить подтверждённые связи.</p>}{result===false&&<p role="status" className="rounded bg-warning-soft p-3 text-[12px] text-warning">Нет подтверждённого пути между выбранными участниками.</p>}</div>; }
