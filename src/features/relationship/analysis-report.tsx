import { useMemo, useRef, useState, type ReactNode } from "react";
import { GitBranch, Network, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/forms";
import { StakeholderGraph } from "@/features/stakeholders/stakeholder-graph";
import type { RelationshipType, StakeholderContact, StakeholderEdge } from "@/features/stakeholders/repository";
import type { AnalysisReport, AnalysisRun, Finding, ReviewItem } from "@/services/relationship-analysis";
import { selectClass } from "./analysis-setup";
import { dateLabel, percentage, RecommendedAction, Sources } from "./analysis-evidence";

const roles = { decision_maker: "ЛПР", influencer: "ЛВР", actual_decider: "ЧФПР", unknown: "Роль не определена" };
const trends = { improving: "Улучшаются", stable: "Стабильны", declining: "Ухудшаются", unknown: "Мало данных" };
const tones = { positive: "Позитивная", negative: "Негативная", mixed: "Смешанная", neutral: "Нейтральная", unknown: "Тональность не определена" };
const feedStates = { pending: "В очереди", checked: "Проверена", unavailable: "Недоступна", blocked: "Загрузка заблокирована" };
const recordingStates = {
  pending: "В очереди", transcribed: "Расшифрована", review: "Проверить совпадение",
  rejected: "Отклонена", unavailable: "Недоступна",
};
const publicationStates = {
  pending: "В очереди", included: "В анализе", review: "Проверить совпадение",
  rejected: "Отклонена", unavailable: "Недоступна", blocked: "Загрузка заблокирована",
} as const;
const edgeTypes: Record<string, RelationshipType> = {
  reports_to: "reports_to", "подчинение": "reports_to",
  influences: "influences", "влияние": "influences",
  collaborates_with: "collaborates_with", "совместный проект": "collaborates_with", "сотрудничество": "collaborates_with",
  introduced_by: "introduced_by", "знакомство": "introduced_by",
};

export function FindingItem({ finding, onSource, expandSources }: {
  finding: Finding;
  onSource: (id: string) => void;
  expandSources?: boolean;
}) {
  return (
    <div className="rounded-md bg-surface-1 p-3 text-sm">
      <p className="wrap-break-word whitespace-pre-line">{finding.text}</p>
      <Sources citations={finding.citations} onSource={onSource} expanded={expandSources} />
    </div>
  );
}

function FindingList({ title, findings, onSource }: { title: string; findings: Finding[]; onSource: (id: string) => void }) {
  if (!findings.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {findings.map((finding, index) => <FindingItem key={index} finding={finding} onSource={onSource} />)}
    </section>
  );
}

export function ReportView({
  run, report, contactId, onContact, onOpenContact, onSource, onReview, onApproveRelationship, canApprove, searchControls, mode = "extended",
}: {
  run: AnalysisRun;
  report: AnalysisReport;
  contactId: string;
  onContact: (id: string) => void;
  onOpenContact?: (id: string) => void;
  onSource: (id: string) => void;
  onReview?: (item: ReviewItem) => void;
  onApproveRelationship?: (proposalId: string) => void;
  canApprove?: boolean;
  searchControls?: ReactNode;
  mode?: "overview" | "extended";
}) {
  const [showGraph, setShowGraph] = useState(true);
  const [showTree, setShowTree] = useState(false);
  const profileRef = useRef<HTMLElement>(null);
  const contact = report.contacts.find((item) => item.id === contactId) ?? report.contacts[0];
  const roleCoverage = report.key_roles !== null;
  const firstPublication = contact?.public_events.find((event) => event.citations.some((source) => source.url)) ?? contact?.public_events[0];
  const otherPublications = contact?.public_events.filter((event) => event !== firstPublication) ?? [];
  const search = report.web_search;
  const { contacts, edges, departments, publicationCounts } = useMemo(() => {
    const reportDate = Date.parse((report.generated_at ?? run.created_at).slice(0, 10));
    const contacts: StakeholderContact[] = report.contacts.map((item) => ({
      id: item.id, accountId: run.id, name: item.name, title: item.title, department: item.department || "Без подразделения",
      role: item.decision_role, influence: item.influence_level === null ? null : Math.max(1, Math.ceil(item.influence_level * 5)),
      stance: "unknown", relationshipStrength: null, relationshipEvidence: "", lastInteractionAt: item.last_touch_at,
      lastMeetingAt: item.interactions.filter((interaction) => /meeting|встреч/i.test(interaction.channel ?? ""))
        .map((interaction) => interaction.occurred_at).filter((value): value is string => Boolean(value))
        .sort((left, right) => right.localeCompare(left))[0] ?? null,
      source: "Таблица клиента", verifiedAt: item.role_confirmed ? run.created_at : null,
      stale: item.last_touch_at !== null && reportDate - Date.parse(item.last_touch_at) >= 90 * 86_400_000,
    }));
    const edges: StakeholderEdge[] = report.connections.flatMap((item) => {
      const type = edgeTypes[item.scope.toLowerCase().trim()];
      if (!type) return [];
      return [{
        id: item.source_id, accountId: run.id, fromId: item.from_id, toId: item.to_id, type,
        strength: null, confidence: "verified", evidence: item.scope, updatedAt: run.created_at,
      }];
    });
    for (const item of report.public_connections ?? []) {
      edges.push({
        id: item.id, accountId: run.id, fromId: item.from_id, toId: item.to_id, type: "shared_event",
        strength: null, confidence: "verified", evidence: item.finding.citations[0]?.label ?? item.finding.text,
        updatedAt: run.created_at,
      });
    }
    for (const item of report.proposed_relationships) {
      const type = edgeTypes[item.scope];
      if (!type) continue;
      edges.push({
        id: item.id, accountId: run.id, fromId: item.from_id, toId: item.to_id, type,
        strength: null, confidence: "inferred", evidence: item.finding.text, updatedAt: run.created_at,
      });
    }
    return {
      contacts, edges, departments: [...new Set(contacts.map((item) => item.department))],
      publicationCounts: new Map(report.contacts.map((item) => [item.id, item.public_events.length])),
    };
  }, [report, run.id, run.created_at]);

  const selectOnMap = (id: string) => {
    if (onOpenContact) {
      onOpenContact(id);
      return;
    }
    onContact(id);
    const profile = profileRef.current;
    if (!profile) return;
    profile.scrollTop = 0;
    if (mode === "overview" && !window.matchMedia("(min-width: 1280px)").matches) {
      profile.scrollIntoView({ block: "start" });
    }
  };

  if (!contact) return <p className="rounded-lg bg-surface-0 p-5 text-sm text-ink-muted">В отчёте пока нет контактов.</p>;
  const lastMeeting = contacts.find((item) => item.id === contact.id)?.lastMeetingAt ?? null;

  const relatedEvents = (report.public_connections ?? [])
    .filter((item) => item.from_id === contact.id || item.to_id === contact.id)
    .map((item) => item.finding);

  if (mode === "overview") {
    return (
      <div className="space-y-3" data-ui="analysis-overview">
        <dl className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface-0">
          {[
            ["Контакты", String(report.contacts.length)],
            ["Покрытие", percentage(report.coverage_score)],
            ["Отношения", percentage(report.relationship_score)],
          ].map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col px-2.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
              <dt className="text-xs text-ink-muted sm:text-sm">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums sm:mt-0 sm:text-xl">{value}</dd>
            </div>
          ))}
        </dl>
        <section className="grid min-w-0 overflow-hidden rounded-xl border border-line bg-surface-0 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]" aria-label="Карта влияния">
          <div className="min-w-0">
            <div role="group" aria-label="Представление контактов" className="flex gap-1 border-b border-line px-2 py-1.5 sm:px-3">
              <Button size="sm" variant={showTree ? "ghost" : "secondary"} aria-pressed={!showTree} onClick={() => setShowTree(false)}>
                <Network /> Карта
              </Button>
              <Button size="sm" variant={showTree ? "secondary" : "ghost"} aria-pressed={showTree} onClick={() => setShowTree(true)}>
                <GitBranch /> Дерево компании
              </Button>
            </div>
            {showTree ? (
              <ul className="min-h-60 space-y-4 px-3 py-4 sm:px-5" aria-label="Подразделения">
                {departments.map((department) => (
                  <li key={department}>
                    <p className="mb-1.5 text-xs font-medium text-ink-muted">{department}</p>
                    <ul className="space-y-1 border-l border-line pl-3">
                      {contacts.filter((item) => item.department === department).map((item) => (
                        <li key={item.id}>
                          <button type="button" aria-current={item.id === contact.id}
                            className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent-soft ${item.id === contact.id ? "bg-accent-soft text-accent" : ""}`}
                            onClick={() => selectOnMap(item.id)}>
                            <span className="block font-medium">{item.name}</span>
                            <span className="block text-xs text-ink-muted">{item.title || "Должность не указана"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="stakeholder-page relationship-embedded-map flex h-[clamp(17rem,47dvh,34rem)] min-w-0 flex-col overflow-hidden">
                <StakeholderGraph key={run.id} accountName={report.company} contacts={contacts} totalContacts={contacts.length} edges={edges}
                  departments={departments} selectedId={contact.id} onSelect={selectOnMap} publicationCounts={publicationCounts}
                  showPopup={false} focusSelection={Boolean(contactId) || contacts.length > 4} />
              </div>
            )}
          </div>
          <aside ref={profileRef}
            className={`min-w-0 scroll-mt-3 space-y-4 border-line p-4 xl:order-none xl:border-l ${contactId ? "-order-1 border-b xl:border-b-0" : "border-t xl:border-t-0"}`}
            aria-label="Карточка контакта на карте" aria-live="polite">
            <div>
              <h2 className="text-xl font-medium">{contact.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">{[contact.title || "Должность не указана", contact.department].filter(Boolean).join(" · ")}</p>
              <div className="mt-3 flex flex-wrap gap-2"><Badge>{trends[contact.relationship_trend]}</Badge></div>
            </div>
            <RecommendedAction contact={contact} generatedAt={report.generated_at ?? run.created_at} onSource={onSource} />
            <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div><dt className="text-ink-muted">Влияние</dt><dd className="mt-1 font-medium">{percentage(contact.influence_level)}</dd></div>
              <div><dt className="text-ink-muted">Касания за 90 дней</dt><dd className="mt-1 font-medium">{contact.touches_90d}</dd></div>
              <div><dt className="text-ink-muted">Последняя встреча</dt><dd className="mt-1 font-medium">{dateLabel(lastMeeting)}</dd></div>
              <div><dt className="text-ink-muted">Публичные события</dt><dd className="mt-1 font-medium">{contact.public_events.length}</dd></div>
            </dl>
            <FindingList title="Общие публичные события" findings={relatedEvents} onSource={onSource} />
            <FindingList title="Профессиональные темы" findings={contact.professional_topics} onSource={onSource} />
          </aside>
        </section>
        <div className="grid gap-3 md:grid-cols-2">
          {[...report.account_risks.slice(0, 2), ...report.alerts.slice(0, 2)].slice(0, 4).map((finding, index) => (
            <FindingItem key={index} finding={finding} onSource={onSource} />
          ))}
        </div>
        {report.review.some((item) => !item.decision) && <p className="bg-warning-soft p-4 text-sm">Источников ждут проверки · {report.review.filter((item) => !item.decision).length}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Разделы расширенного анализа" className="flex flex-wrap gap-2">
        <a href="#analysis-comparison" className="rounded-md bg-surface-1 px-3 py-2 text-sm hover:text-accent">Сравнение контактов</a>
        <a href="#analysis-contact" className="rounded-md bg-surface-1 px-3 py-2 text-sm hover:text-accent">Профиль и история</a>
        <a href="#analysis-evidence" className="rounded-md bg-surface-1 px-3 py-2 text-sm hover:text-accent">Риски и источники</a>
      </nav>
      <dl className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface-0">
        {[
          ["Контакты", String(report.contacts.length), null],
          [roleCoverage ? "Покрытие ключевых ролей" : "Покрытие ключевых контактов", percentage(report.coverage_score),
            `${roleCoverage ? report.covered_key_roles : report.covered_key_contacts} из ${roleCoverage ? report.key_roles : report.key_contacts} за 90 дней`],
          ["Состояние отношений", percentage(report.relationship_score), "По контактам с датированными касаниями"],
        ].map(([label, value, explanation]) => (
          <div key={label} className="min-w-0 p-2.5 sm:p-4">
            <dt className="text-xs leading-tight text-ink-muted">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{value}</dd>
            {explanation && <dd className="sr-only text-xs text-ink-muted sm:not-sr-only sm:mt-1">{explanation}</dd>}
          </div>
        ))}
      </dl>
      <section id="analysis-comparison" className="scroll-mt-4 space-y-3 rounded-lg bg-surface-0 p-4 md:p-5">
        <h2 className="text-lg font-semibold">Сравнение контактов</h2>
        <p className="text-sm text-ink-muted">Контакты отсортированы по оценке влияния. Выберите человека, чтобы открыть историю и основания оценки.</p>
        <div className="xl:overflow-x-auto">
          <table className="block w-full text-left text-sm xl:table xl:min-w-[46rem]">
            <thead className="sr-only bg-surface-1 text-xs text-ink-muted xl:not-sr-only">
              <tr>{["Контакт и должность", "Влияние", "Отношения", "Касания за 90 дней", "Последняя встреча", "Следующий шаг"].map((label) =>
                <th key={label} scope="col" className="px-3 py-2 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody className="grid gap-2 xl:table-row-group xl:divide-y xl:divide-line">
              {[...report.contacts].sort((left, right) => (right.influence_level ?? -1) - (left.influence_level ?? -1)).map((item) => (
                <tr key={item.id} className={`grid grid-cols-2 gap-x-2 gap-y-1 rounded-md p-2 xl:table-row xl:p-0 ${item.id === contact.id ? "bg-accent-soft" : "bg-surface-1/45 xl:bg-transparent"}`}>
                  <th scope="row" className="col-span-2 px-2 py-1 font-normal xl:px-3 xl:py-2">
                    <a href="#analysis-contact" onClick={() => onContact(item.id)} className="font-medium text-accent hover:underline">{item.name}</a>
                    <p className="text-xs text-ink-muted">{item.title || "Должность не указана"}</p>
                  </th>
                  <td className="px-2 py-1 xl:px-3 xl:py-2"><span aria-hidden className="block text-xs text-ink-muted xl:hidden">Влияние</span>{percentage(item.influence_level)}</td>
                  <td className="px-2 py-1 xl:px-3 xl:py-2"><span aria-hidden className="block text-xs text-ink-muted xl:hidden">Отношения</span>{trends[item.relationship_trend]}</td>
                  <td className="px-2 py-1 tabular-nums xl:px-3 xl:py-2"><span aria-hidden className="block text-xs text-ink-muted xl:hidden">Касания за 90 дней</span>{item.touches_90d}</td>
                  <td className="px-2 py-1 xl:px-3 xl:py-2"><span aria-hidden className="block text-xs text-ink-muted xl:hidden">Последняя встреча</span>{dateLabel(contacts.find((entry) => entry.id === item.id)?.lastMeetingAt ?? null)}</td>
                  <td className="col-span-2 px-2 pt-1 pb-2 text-xs leading-5 wrap-anywhere xl:max-w-64 xl:px-3 xl:py-2">
                    <span aria-hidden className="block text-ink-muted xl:hidden">Следующий шаг</span>{item.next_action?.text || "Нет рекомендации"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div id="analysis-contact" className="scroll-mt-4 space-y-4 rounded-lg border border-line bg-surface-0 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">Карта влияния</h2>
          <Button size="sm" variant="secondary" aria-expanded={showGraph} onClick={() => setShowGraph(!showGraph)}>
            <Network />{showGraph ? "Скрыть граф" : "Показать граф"}
          </Button>
        </div>
        {search && (
          <a href="#analysis-evidence" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-surface-1 px-3 py-2 text-xs hover:border-accent">
            <Search className="size-3.5 text-accent" aria-hidden="true" />
            <span className="font-medium text-accent">Веб-поиск</span>
            <span className="text-ink-muted">Проверено {search.searched_contacts} из {search.total_contacts} · Новых ссылок · {search.discovered}</span>
            {search.checked_at && <time className="text-ink-muted" dateTime={search.checked_at}>{dateLabel(search.checked_at)}</time>}
          </a>
        )}
        <div className={showGraph ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,33%)]" : "grid"}>
          {showGraph && (
            <div className="stakeholder-page relationship-embedded-map flex h-[min(70dvh,660px)] min-h-[420px] min-w-0 flex-col overflow-hidden rounded-md border border-line">
              <StakeholderGraph accountName={report.company} contacts={contacts} totalContacts={contacts.length} edges={edges}
                departments={departments} selectedId={contact.id} onSelect={selectOnMap} publicationCounts={publicationCounts} />
            </div>
          )}
          <aside ref={profileRef} aria-label="Карточка контакта на карте"
            className={`min-w-0 scroll-mt-14 space-y-3 rounded-md border border-line p-3${showGraph ? " lg:max-h-[min(70dvh,660px)] lg:min-h-[420px] lg:overflow-y-auto" : ""}`}>
            <label className="grid gap-1 text-xs text-ink-muted">
              Контакт
              <select className={selectClass} value={contact.id} onChange={(event) => onContact(event.target.value)}>
                {report.contacts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.title && ` · ${item.title}`}</option>)}
              </select>
            </label>
            <div>
              <h3 className="wrap-break-word text-base font-medium">{contact.name}</h3>
              <p className="text-xs text-ink-muted">{contact.title || "Должность не указана"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {contact.department && <Badge>{contact.department}</Badge>}
              </div>
            </div>
            <section key={contact.id} className="space-y-2 border-t border-line pt-3">
              <h4 className="text-sm font-medium">Публичные события · {contact.public_events.length}</h4>
              {contact.profile_confidence !== null && <p className="text-xs text-ink-muted">Лучшее совпадение профиля · {percentage(contact.profile_confidence)}</p>}
              {firstPublication
                ? <FindingItem finding={firstPublication} onSource={onSource} expandSources />
                : <p className="text-xs text-ink-muted">Для контакта пока нет подтверждённых публикаций.</p>}
              {otherPublications.length > 0 && (
                <details className="space-y-2">
                  <summary className="cursor-pointer text-xs text-accent">Другие публикации · {otherPublications.length}</summary>
                  {otherPublications.map((finding, index) => <FindingItem key={index} finding={finding} onSource={onSource} />)}
                </details>
              )}
            </section>
            <RecommendedAction contact={contact} generatedAt={report.generated_at ?? run.created_at} onSource={onSource} />
            <FindingList title="Профессиональные темы" findings={contact.professional_topics} onSource={onSource} />
            <FindingList title="Упомянутые технологии" findings={contact.technologies} onSource={onSource} />
          </aside>
        </div>
        <Sources citations={contact.role_evidence} onSource={onSource} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-3 sm:grid-cols-3">
          {[
            ["Влияние", percentage(contact.influence_level)],
            ["Роль в принятии решения", `${roles[contact.decision_role]}${!contact.role_confirmed && contact.decision_role !== "unknown" ? " · требует проверки" : ""}`],
            ["Касания за 90 дней", String(contact.touches_90d)],
            ["Последняя встреча", dateLabel(lastMeeting)],
            ["Динамика отношений", trends[contact.relationship_trend]],
            ["Вовлечённость", percentage(contact.engagement_score)],
            ["Состояние отношений", percentage(contact.relationship_health)],
            ["Темы из технологического словаря", percentage(contact.business_relevance)],
          ].map(([label, value]) => (
            <div key={label}><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-0.5 text-sm font-medium">{value}</dd></div>
          ))}
        </dl>
        <Sources citations={contact.interaction_evidence} onSource={onSource} />
        {contact.loyalty_assessment && (
          <div className="rounded-md bg-surface-1 p-3 text-sm">
            Лояльность контакта в CRM · {contact.loyalty_assessment}
            <Sources citations={contact.loyalty_evidence} onSource={onSource} />
          </div>
        )}
        {contact.influence_signals.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Из чего складывается влияние</summary>
            <ul className="mt-2 space-y-2">
              {contact.influence_signals.map((signal) => (
                <li key={signal.label} className="rounded-md bg-surface-1 p-3 text-sm">
                  {signal.label} · {percentage(signal.value)} при весе {percentage(signal.weight)}
                  <Sources citations={signal.citations} onSource={onSource} />
                </li>
              ))}
            </ul>
          </details>
        )}
        {contact.interactions.length > 0 && (
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm font-medium">История взаимодействий</summary>
            <ul className="space-y-3">
              {contact.interactions.map((item) => (
                <li key={item.source_id} className="space-y-2 border-t border-line pt-3">
                  <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
                    <time>{dateLabel(item.occurred_at)}</time>
                    {[item.channel, item.author, item.project].filter(Boolean).map((field, index) => <span key={index}>{field}</span>)}
                    <Badge tone={item.sentiment === "negative" ? "amber" : "neutral"}>{tones[item.sentiment]}</Badge>
                  </div>
                  <FindingItem finding={item.summary} onSource={onSource} />
                  <FindingList title="Темы взаимодействия" findings={item.topics} onSource={onSource} />
                </li>
              ))}
            </ul>
          </details>
        )}
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm font-medium">Люди, компании и должности</summary>
          <FindingList title="Люди" findings={contact.people} onSource={onSource} />
          <FindingList title="Компании" findings={contact.organizations} onSource={onSource} />
          <FindingList title="Должности" findings={contact.job_titles} onSource={onSource} />
          <FindingList title="Выраженные позиции" findings={contact.positions} onSource={onSource} />
        </details>
      </div>
      <section id="analysis-evidence" className="scroll-mt-4 space-y-4">
        <h2 className="text-lg font-semibold">Риски и источники</h2>
        {searchControls}
        <FindingList title="Общие публичные события" findings={(report.public_connections ?? []).map((item) => item.finding)} onSource={onSource} />
        {!report.account_loyalty && !report.departments.length && !report.feeds.length && !report.recordings.length
          && !report.web_search && !report.publications.length && !report.review.length && !report.connections.length
          && !report.account_risks.length && !report.alerts.length && !report.relationships.length
          && !report.proposed_relationships.length && (
            <p className="rounded-lg bg-surface-0 p-4 text-sm text-ink-muted">В отчёте пока нет рисков или дополнительных источников.</p>
          )}
        {(report.departments.length > 0 || report.account_loyalty) && (
          <section className="space-y-3 rounded-lg border border-line bg-surface-0 p-4 md:p-5">
            <h2 className="text-base font-medium">Работа с клиентом</h2>
            {report.account_loyalty && <div className="text-sm">Лояльность клиента в CRM · {report.account_loyalty}
              <Sources citations={report.account_evidence} onSource={onSource} />
            </div>}
            {report.departments.length > 0 && (
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm font-medium">Охват подразделений за 90 дней</summary>
                <ul className="space-y-2">
                  {report.departments.map((item) => (
                    <li key={item.department} className="rounded-md bg-surface-1 p-2 text-sm">
                      {item.department} · {item.reached} из {item.total}
                      <Sources citations={item.evidence} onSource={onSource} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
        {(report.feeds.length > 0 || report.recordings.length > 0 || report.web_search) && (
          <section id="relationship-sources" className="space-y-3 rounded-lg border border-line bg-surface-0 p-4 md:p-5">
            <h2 className="text-base font-medium">Поиск и сбор источников</h2>
            <ul className="space-y-2 text-sm">
              {report.web_search && (
                <li className="space-y-1">
                  <span className="font-medium">Веб-поиск по ФИО и компании</span>
                  <p className="text-xs text-ink-muted">
                    {report.web_search.searched_contacts} из {report.web_search.total_contacts} контактов · новых ссылок: {report.web_search.discovered}
                  </p>
                  {!!report.web_search.queries && <p className="text-xs text-ink-muted">
                    Запросов · {report.web_search.queries}{report.web_search.failed_queries ? ` · без ответа: ${report.web_search.failed_queries}` : ""}
                  </p>}
                  {!!report.web_search.keywords?.length && <p className="text-xs text-ink-muted">Ключевые слова · {report.web_search.keywords.join(", ")}</p>}
                  {!!report.web_search.wikipedia_queries && <p className="text-xs text-ink-muted">
                    Резервный поиск Wikipedia · запросов: {report.web_search.wikipedia_queries} · новых ссылок: {report.web_search.wikipedia_discovered ?? 0}
                  </p>}
                  {!!report.web_search.sitemap_queries && <p className="text-xs text-ink-muted">
                    Поиск по карте сайта · новых ссылок: {report.web_search.sitemap_discovered ?? 0}
                  </p>}
                  {report.web_search.reason && <p className="text-xs text-warning">{report.web_search.reason}</p>}
                </li>
              )}
              {report.recordings.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline gap-2">
                  <span>{item.label}</span><Badge>{recordingStates[item.state]}</Badge>
                  {item.reason && <span className="text-xs text-ink-muted">{item.reason}</span>}
                </li>
              ))}
              {report.feeds.map((feed) => (
                <li key={feed.url} className="flex flex-wrap items-baseline gap-2">
                  {feed.state === "blocked" ? <span className="wrap-anywhere">{feed.url}</span> : (
                    <a className="wrap-anywhere text-accent underline" href={feed.url} target="_blank" rel="noreferrer">{feed.url}</a>
                  )}
                  <Badge>{feedStates[feed.state]}</Badge>
                  {feed.checked_at && <span className="text-xs text-ink-muted">Найдено · {feed.discovered}</span>}
                  {feed.reason && <span className="text-xs text-ink-muted">{feed.reason}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {report.publications.length > 0 && (
          <section className="space-y-3 rounded-lg border border-line bg-surface-0 p-4 md:p-5">
            <h2 className="text-base font-medium">Загрузка публикаций</h2>
            <p className="text-sm text-ink-muted">
              В отчёте · {report.publications.filter((item) => item.state === "included").length} из {report.publications.length}
            </p>
            <ul className="divide-y divide-line">
              {report.publications.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    {item.state === "blocked" ? (
                      <span className="text-sm">{item.label}</span>
                    ) : (
                      <a className="wrap-break-word text-sm text-accent underline" href={item.url} target="_blank" rel="noreferrer">
                        {item.label}
                      </a>
                    )}
                    {item.search_provider === "wikipedia" && <p className="mt-0.5 text-xs text-ink-muted">Найдено в резервном поиске Wikipedia</p>}
                    {item.search_provider === "sitemap" && <p className="mt-0.5 text-xs text-ink-muted">Найдено по карте сайта источника</p>}
                    {item.reason && <p className="mt-0.5 text-xs text-ink-muted">{item.reason}</p>}
                  </div>
                  <Badge tone={item.state === "included" ? "violet" : item.state === "pending" ? "neutral" : "amber"}>
                    {publicationStates[item.state]}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(report.account_risks.length > 0 || report.alerts.length > 0 || report.relationships.length > 0
          || report.review.length > 0 || report.proposed_relationships.length > 0) && (
          <div className="space-y-4 rounded-lg border border-line bg-surface-0 p-4 md:p-5">
            <FindingList title="Риски клиента" findings={report.account_risks} onSource={onSource} />
            <FindingList title="Изменения в отношениях" findings={report.alerts} onSource={onSource} />
            {report.proposed_relationships.length > 0 && (
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm font-medium">Предложенные связи · {report.proposed_relationships.length}</summary>
                {report.proposed_relationships.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <FindingItem finding={item.finding} onSource={onSource} />
                    {canApprove && onApproveRelationship && <Button size="sm" variant="secondary" onClick={() => onApproveRelationship(item.id)}>Подтвердить связь</Button>}
                  </div>
                ))}
              </details>
            )}
            {report.relationships.length > 0 && (
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm font-medium">Подтверждённые связи · {report.relationships.length}</summary>
                {report.relationships.map((finding, index) => <FindingItem key={index} finding={finding} onSource={onSource} />)}
              </details>
            )}
            {report.review.length > 0 && (
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Проверка источников · {report.review.filter((item) => !item.decision).length} ждут проверки
                </summary>
                <ul className="space-y-2">
                  {report.review.map((item, index) => (
                    <li key={item.source_id ?? index} className={`rounded-md p-3 text-sm ${item.decision ? "bg-surface-1" : "bg-warning-soft"}`}>
                      <p className="font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-ink-muted">{item.reason} Уверенность · {percentage(item.confidence)}</p>
                      {item.decision && (
                        <div className="mt-2 space-y-1 text-xs">
                          <Badge tone={item.decision.action === "confirmed" ? "violet" : "neutral"}>
                            {item.decision.action === "confirmed" ? "Подтверждена" : "Отклонена"}
                          </Badge>
                          {item.decision.contact_name && <span className="ml-2">{item.decision.contact_name}</span>}
                          <p className="text-ink-muted">{item.decision.reviewer} · {dateLabel(item.decision.reviewed_at)}</p>
                          {item.decision.note && <p className="wrap-break-word">{item.decision.note}</p>}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {item.source_id && !item.decision && onReview && <Button variant="secondary" size="sm" onClick={() => onReview(item)}>Открыть проверку</Button>}
                        {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-accent underline">Открыть источник</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
