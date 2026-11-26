import { useId, useMemo, useState } from "react";
import { Maximize, Minus, Plus, Users } from "lucide-react";
import { initials } from "@/lib/utils";
import { CARD, layoutGraph, routeEdges } from "./graph-layout";
import { edgeNames, roleNames, stanceNames } from "./graph-labels";
import type { RelationshipType, StakeholderContact, StakeholderEdge } from "./repository";
import { MAX_SCALE, useGraphCamera } from "./use-graph-camera";

const RELATIONS = {
  reports_to: { label: "Подчинение", dash: undefined, directed: true },
  influences: { label: "Влияние", dash: "7 4", directed: true },
  collaborates_with: { label: "Сотрудничество", dash: undefined, directed: false },
  introduced_by: { label: "Знакомство", dash: "2 4", directed: true },
} satisfies Record<RelationshipType, { label: string; dash: string | undefined; directed: boolean }>;
const RELATION_TYPES = Object.keys(RELATIONS) as RelationshipType[];

type GraphProps = {
  accountName: string;
  contacts: StakeholderContact[];
  totalContacts: number;
  edges: StakeholderEdge[];
  departments: readonly string[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function StakeholderGraph({ accountName, contacts, totalContacts, edges, departments, selectedId, onSelect }: GraphProps) {
  const uid = useId();
  const [initialContactId] = useState(selectedId);
  const { nodes, size } = useMemo(() => layoutGraph(contacts, edges, departments), [contacts, edges, departments]);
  const paths = useMemo(() => routeEdges(edges, nodes), [edges, nodes]);
  const initialFocus = nodes.get(initialContactId) ?? nodes.values().next().value;
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Users aria-hidden="true" className="size-3.5" />
          {contacts.length} из {totalContacts} · Связи: {paths.length}
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Управление картой">
          <button type="button" aria-label="Уменьшить масштаб" disabled={camera.scale <= minScale} onClick={() => zoom(1 / 1.25)} className="stakeholder-map-control">
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <span className="w-12 text-center font-mono-data text-[11px]" aria-label="Масштаб">{Math.round(camera.scale * 100)}%</span>
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
                  <title>{from.contact.name} {relation.directed ? "→" : "↔"} {to.contact.name} · {edgeNames[edge.type]} · {edge.confidence === "verified" ? "Подтверждено" : "Требует проверки"}</title>
                  <path className="stakeholder-edge-target" d={path} />
                  <path
                    className="stakeholder-edge-line"
                    d={path}
                    strokeDasharray={relation.dash ?? (edge.confidence !== "verified" ? "4 4" : undefined)}
                    markerEnd={relation.directed ? `url(#${uid}-${edge.type})` : undefined}
                  />
                </g>
              );
            })}
            {Array.from(nodes.values(), (node) => {
              const { contact, x, y } = node;
              return (
                <foreignObject key={contact.id} x={x - CARD.width / 2} y={y - CARD.height / 2} width={CARD.width} height={CARD.height}>
                  <button
                    type="button"
                    className="stakeholder-node"
                    data-role={contact.role}
                    data-related={connected.has(contact.id)}
                    aria-label={`${contact.name}, ${roleNames[contact.role]}, ${stanceNames[contact.stance]}`}
                    aria-pressed={contact.id === selectedId}
                    onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) reveal(node); }}
                    onClick={() => onSelect(contact.id)}
                    title={contact.name}
                  >
                    <span className="stakeholder-node-avatar" aria-hidden="true">{initials(contact.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{contact.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">{roleNames[contact.role]} · {contact.influence ? `${contact.influence}/5` : "влияние не оценено"}</span>
                      <span className="block truncate text-[10px] text-ink-muted">{contact.department}</span>
                      {contact.stale && <span className="block truncate text-[10px] text-warning">Давно не общались</span>}
                    </span>
                    <span className="stakeholder-node-stance" data-stance={contact.stance} title={stanceNames[contact.stance]} aria-hidden="true" />
                  </button>
                </foreignObject>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-ink-muted">
        {RELATION_TYPES.map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <svg aria-hidden="true" viewBox="0 0 24 10" width="24" height="10" className="stakeholder-legend" data-type={type}>
              <path d="M 0 5 H 19" stroke="currentColor" strokeWidth={2} strokeDasharray={RELATIONS[type].dash} />
              {RELATIONS[type].directed && <path d="M 18 1 L 24 5 L 18 9 Z" fill="currentColor" />}
            </svg>
            {RELATIONS[type].label}
          </span>
        ))}
        <span id={`${uid}-navigation`} className="sr-only">
          Перетащите карту мышью или пальцем. Колесо и жест двумя пальцами меняют масштаб. На клавиатуре используйте стрелки, плюс и минус. Клавиша Home покажет всю карту.
        </span>
        <span className="ml-auto hidden text-ink-muted xl:inline">Перетаскивание · масштаб колесом</span>
      </div>
    </>
  );
}
