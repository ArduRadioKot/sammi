import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { FileText, Maximize, Minus, Plus, Users, X } from "lucide-react";
import { initials } from "@/lib/utils";
import { CARD, layoutGraph, routeEdges } from "./graph-layout";
import { edgeNames, stanceNames } from "./graph-labels";
import type { RelationshipType, StakeholderContact, StakeholderEdge } from "./repository";
import { MAX_SCALE, useGraphCamera } from "./use-graph-camera";

const RELATIONS = {
  reports_to: { label: "Подчинение", dash: undefined, directed: true },
  influences: { label: "Влияние", dash: "7 4", directed: true },
  collaborates_with: { label: "Сотрудничество", dash: undefined, directed: false },
  introduced_by: { label: "Знакомство", dash: "2 4", directed: true },
  shared_event: { label: "Общее публичное событие", dash: "2 5", directed: false },
} satisfies Record<RelationshipType, { label: string; dash: string | undefined; directed: boolean }>;
const RELATION_TYPES = Object.keys(RELATIONS) as RelationshipType[];
const dateLabel = (value: string) => new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const compactQuery = "(max-width: 639px)";
const compactScreen = () => window.matchMedia(compactQuery).matches;
function subscribeToScreenSize(notify: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

type GraphProps = {
  accountName: string;
  contacts: StakeholderContact[];
  totalContacts: number;
  edges: StakeholderEdge[];
  departments: readonly string[];
  selectedId: string;
  onSelect: (id: string) => void;
  publicationCounts?: ReadonlyMap<string, number>;
  showPopup?: boolean;
  focusSelection?: boolean;
};

export function StakeholderGraph({
  accountName, contacts, totalContacts, edges, departments, selectedId, onSelect,
  publicationCounts, showPopup = true, focusSelection = true,
}: GraphProps) {
  const uid = useId();
  const [popupId, setPopupId] = useState("");
  const [initialContactId] = useState(selectedId);
  const compact = useSyncExternalStore(subscribeToScreenSize, compactScreen, () => false) && !showPopup;
  const { nodes, size } = useMemo(() => layoutGraph(contacts, edges, departments, compact), [compact, contacts, edges, departments]);
  const paths = useMemo(() => routeEdges(edges, nodes), [edges, nodes]);
  const initialFocus = focusSelection ? nodes.get(initialContactId) ?? nodes.values().next().value : undefined;
  const { svgRef, camera, dragging, gesture, minScale, pan, reveal, zoom, fit, pointerHandlers } = useGraphCamera(size, initialFocus);
  const visibleSelection = nodes.has(selectedId);
  const connected = new Set<string>();
  const isConnected = (edge: StakeholderEdge) => edge.fromId === selectedId || edge.toId === selectedId;
  for (const { edge } of paths) {
    if (!isConnected(edge)) continue;
    connected.add(edge.fromId);
    connected.add(edge.toId);
  }
  const orderedPaths = [...paths].sort((a, b) => Number(isConnected(a.edge)) - Number(isConnected(b.edge)));

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2.5 py-1.5 text-xs sm:px-4">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Users aria-hidden="true" className="size-3.5" />
          <span className="hidden sm:inline">{contacts.length} из {totalContacts} · </span>Связи: {paths.length}
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Управление картой">
          <button type="button" aria-label="Уменьшить масштаб" disabled={camera.scale <= minScale} onClick={() => zoom(1 / 1.25)} className="stakeholder-map-control">
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <span className="w-9 text-center text-[11px] tabular-nums sm:w-12" aria-label="Масштаб">{Math.round(camera.scale * 100)}%</span>
          <button type="button" aria-label="Увеличить масштаб" disabled={camera.scale >= MAX_SCALE} onClick={() => zoom(1.25)} className="stakeholder-map-control">
            <Plus aria-hidden="true" className="size-4" />
          </button>
          <button type="button" onClick={fit} className="stakeholder-map-control px-2">
            <Maximize aria-hidden="true" className="size-3.5" /> Вся карта
          </button>
        </div>
      </div>
      <div className="stakeholder-graph-wrap relative min-h-0 flex-1">
        <svg
          ref={svgRef}
          className="stakeholder-graph"
          data-dragging={dragging}
          role="group"
          tabIndex={0}
          aria-label={`Карта участников: ${accountName}`}
          aria-describedby={`${uid}-navigation`}
          {...pointerHandlers}
          onClickCapture={(event) => {
            if (gesture.current && event.detail > 0) event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === "+" || event.key === "=") zoom(1.25);
            else if (event.key === "-") zoom(1 / 1.25);
            else if (event.key === "Home" || event.key === "0") fit();
            else if (event.key === "ArrowLeft") pan(60, 0);
            else if (event.key === "ArrowRight") pan(-60, 0);
            else if (event.key === "ArrowUp") pan(0, 60);
            else if (event.key === "ArrowDown") pan(0, -60);
            else return;
            event.preventDefault();
          }}
        >
          <defs>
            {RELATION_TYPES.filter((type) => RELATIONS[type].directed).map((type) => (
              <marker key={type} id={`${uid}-${type}`} viewBox="0 0 10 10" refX={10} refY={5} markerWidth={8} markerHeight={8} markerUnits="userSpaceOnUse" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 Z" className="stakeholder-arrow" data-type={type} />
              </marker>
            ))}
          </defs>
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
            {orderedPaths.map(({ edge, from, to, path }) => {
              const relation = RELATIONS[edge.type];
              return (
                <g
                  key={edge.id}
                  className="stakeholder-edge"
                  data-type={edge.type}
                  data-active={isConnected(edge)}
                  data-muted={visibleSelection && !isConnected(edge)}
                  data-unverified={edge.confidence !== "verified"}
                  aria-hidden="true"
                >
                  <title>{from.contact.name} {relation.directed ? "→" : "↔"} {to.contact.name} · {edgeNames[edge.type]} · {edge.type === "shared_event" ? edge.evidence : edge.confidence === "verified" ? "Подтверждено" : "Требует проверки"}</title>
                  <path className="stakeholder-edge-target" d={path} />
                  <path
                    className="stakeholder-edge-line"
                    d={path}
                    strokeDasharray={edge.confidence !== "verified" ? "4 4" : relation.dash}
                    markerEnd={relation.directed ? `url(#${uid}-${edge.type})` : undefined}
                  />
                </g>
              );
            })}
            {Array.from(nodes.values(), (node) => {
              const { contact, x, y } = node;
              const publications = publicationCounts?.get(contact.id) ?? 0;
              return (
                <foreignObject key={contact.id} x={x - CARD.width / 2} y={y - CARD.height / 2} width={CARD.width} height={CARD.height}>
                  <button
                    type="button"
                    className="stakeholder-node"
                    data-role={contact.role}
                    data-related={connected.has(contact.id)}
                    aria-label={`${contact.name}${contact.title ? `, ${contact.title}` : ""}, ${stanceNames[contact.stance]}${publications ? `, публичных событий ${publications}` : ""}`}
                    aria-pressed={contact.id === selectedId}
                    onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) reveal(node); }}
                    onClick={() => { if (showPopup) setPopupId(contact.id); onSelect(contact.id); }}
                    title={contact.name}
                  >
                    <span className="stakeholder-node-avatar" aria-hidden="true">{initials(contact.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{contact.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">{contact.title || "Должность не указана"}</span>
                      <span className="block truncate text-[10px] text-ink-muted">{contact.department}</span>
                      {contact.lastMeetingAt && <span className="block truncate text-[10px] text-ink-muted">Встреча · {dateLabel(contact.lastMeetingAt)}</span>}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5" aria-hidden="true">
                      {publications > 0 && (
                        <span className="flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent" title={`Публичные события · ${publications}`}>
                          <FileText className="size-3" />{publications}
                        </span>
                      )}
                      <span className="stakeholder-node-stance" data-stance={contact.stance} title={stanceNames[contact.stance]} />
                    </span>
                  </button>
                </foreignObject>
              );
            })}
            {popupId && nodes.get(popupId) && (() => {
              const node = nodes.get(popupId)!;
              const { contact } = node;
              const popupX = Math.max(132, Math.min(size.width - 132, node.x));
              const popupY = node.y < 150 ? node.y + CARD.height / 2 + 8 : node.y - CARD.height / 2 - 102;
              return (
                <foreignObject key={`popup-${contact.id}`} x={popupX - 132} y={popupY} width={264} height={94}>
                  <section onPointerDown={(event) => event.stopPropagation()} className="relative h-full overflow-hidden rounded-md border border-line bg-surface-0 p-3 text-ink shadow-[var(--shadow-float)]" aria-label={`Карточка ${contact.name}`}>
                    <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setPopupId("")}
                      className="absolute right-2 top-2 flex size-6 items-center justify-center rounded text-ink-muted hover:bg-surface-1" aria-label="Закрыть карточку">
                      <X className="size-3.5" />
                    </button>
                    <p className="truncate pr-7 text-[10px] text-ink-muted">{accountName}</p>
                    <h3 className="mt-0.5 truncate text-[13px] font-semibold">{contact.name}</h3>
                    <p className="truncate text-[11px] text-ink-muted">{[contact.title || "Должность не указана", contact.department].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 truncate text-[10px] text-ink-muted">Последняя встреча · {contact.lastMeetingAt ? dateLabel(contact.lastMeetingAt) : "нет данных"}</p>
                  </section>
                </foreignObject>
              );
            })()}
          </g>
        </svg>
      </div>
      <div className={`shrink-0 text-[11px] text-ink-muted ${paths.length ? "flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 sm:px-4" : ""}`}>
        {RELATION_TYPES.filter((type) => paths.some(({ edge }) => edge.type === type)).map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <svg aria-hidden="true" viewBox="0 0 24 10" width="24" height="10" className="stakeholder-legend" data-type={type}>
              <path d="M 0 5 H 19" stroke="currentColor" strokeWidth={2} strokeDasharray={RELATIONS[type].dash} />
              {RELATIONS[type].directed && <path d="M 18 1 L 24 5 L 18 9 Z" fill="currentColor" />}
            </svg>
            {RELATIONS[type].label}
          </span>
        ))}
        {paths.some(({ edge }) => edge.confidence !== "verified") && <span>Пунктирные предложения требуют проверки.</span>}
        <span id={`${uid}-navigation`} className="sr-only">
          Перетащите карту мышью или пальцем. Для масштабирования используйте Ctrl или ⌘ с колесом, кнопки либо жест двумя пальцами. На клавиатуре используйте стрелки, плюс и минус. Клавиша Home покажет всю карту.
        </span>
        {!!paths.length && <span className="ml-auto hidden text-ink-muted xl:inline">Перетаскивание · масштаб Ctrl / ⌘ + колесо</span>}
      </div>
    </>
  );
}
