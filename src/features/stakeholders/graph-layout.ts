import type { StakeholderContact, StakeholderEdge } from "./repository";

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
type Node = Point & { row: number; column: number; contact: StakeholderContact };

export const CARD = { width: 224, height: 76 };
const COLUMN_STEP = CARD.width + 72;
const ROW_STEP = CARD.height + 65;
const LEFT = 26;
const TOP = 52;
const PER_ROW = 3;
const ROLE_LEVEL: Record<StakeholderContact["role"], number> = {
  decision_maker: 0, actual_decider: 0, influencer: 1, initiator: 1, technical_expert: 1, procurement: 1,
  user: 2, unknown: 2,
};

export function layoutGraph(contacts: StakeholderContact[], edges: StakeholderEdge[], departments: readonly string[]) {
  const people = new Map(contacts.map((contact) => [contact.id, contact]));
  const managers = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.type !== "reports_to" || edge.confidence !== "verified" || !people.has(edge.toId) || !people.has(edge.fromId)) continue;
    managers.set(edge.fromId, [...(managers.get(edge.fromId) ?? []), edge.toId]);
  }

  const supervisors = new Set([...managers.values()].flat());
  const levels = new Map<string, number>();
  const pending = new Set(people.keys());
  while (pending.size) {
    const ready = [...pending].filter((id) => (managers.get(id) ?? []).every((manager) => levels.has(manager)));
    if (!ready.length) break;
    for (const id of ready) {
      const parents = managers.get(id) ?? [];
      const fallback = ROLE_LEVEL[people.get(id)!.role];
      // A named manager belongs above their reports, even when their decision role is unknown.
      const isManager = supervisors.has(id);
      const level = parents.length ? Math.max(...parents.map((parent) => levels.get(parent)!)) + 1 : isManager ? 0 : fallback;
      levels.set(id, level);
      pending.delete(id);
    }
  }
  const groups = new Map<number, StakeholderContact[]>();
  for (const contact of contacts) {
    const level = levels.get(contact.id) ?? ROLE_LEVEL[contact.role];
    groups.set(level, [...(groups.get(level) ?? []), contact]);
  }

  const nodes = new Map<string, Node>();
  const columns = Math.max(1, ...[...groups.values()].map((group) => Math.min(PER_ROW, group.length)));
  const cardsWidth = CARD.width + (columns - 1) * COLUMN_STEP;
  const departmentOrder = new Map(departments.map((name, index) => [name, index]));
  let row = 0;
  for (const [, group] of [...groups.entries()].sort(([a], [b]) => a - b)) {
    group.sort((a, b) => (departmentOrder.get(a.department) ?? 0) - (departmentOrder.get(b.department) ?? 0)
      || ROLE_LEVEL[a.role] - ROLE_LEVEL[b.role] || a.name.localeCompare(b.name, "ru"));
    for (let offset = 0; offset < group.length; offset += PER_ROW) {
      const line = group.slice(offset, offset + PER_ROW);
      const xOffset = (cardsWidth - (CARD.width + (line.length - 1) * COLUMN_STEP)) / 2;
      line.forEach((contact, column) => nodes.set(contact.id, {
        x: LEFT + xOffset + CARD.width / 2 + column * COLUMN_STEP,
        y: TOP + CARD.height / 2 + row * ROW_STEP,
        row, column, contact,
      }));
      row++;
    }
  }

  return { nodes, size: { width: LEFT + cardsWidth + 90, height: TOP + Math.max(0, row - 1) * ROW_STEP + CARD.height + 36 } };
}

export function routeEdges(edges: StakeholderEdge[], nodes: Map<string, Node>) {
  const right = Math.max(0, ...[...nodes.values()].map((node) => node.x)) + CARD.width / 2;
  return edges.flatMap((edge, index) => {
    const from = nodes.get(edge.fromId);
    const to = nodes.get(edge.toId);
    if (!from || !to || from === to) return [];
    const direction = from.row < to.row ? 1 : -1;
    const port = (index % 7 - 3) * 9;
    const lane = 16 + (index % 6) * 6;
    const x1 = from.x + port;
    const x2 = to.x + port;
    const y1 = from.y + direction * CARD.height / 2;
    const y2 = to.y - direction * CARD.height / 2;
    let points: Point[];
    if (from.row === to.row) {
      const above = from.y - CARD.height / 2;
      points = [{ x: x1, y: above }, { x: x1, y: above - lane }, { x: x2, y: above - lane }, { x: x2, y: above }];
    } else if (Math.abs(from.row - to.row) === 1) {
      const gap = (y1 + y2) / 2 + (index % 5 - 2) * 5;
      points = [{ x: x1, y: y1 }, { x: x1, y: gap }, { x: x2, y: gap }, { x: x2, y: y2 }];
    } else {
      const start = y1 + direction * lane;
      const end = y2 - direction * lane;
      const gutter = right + lane;
      points = [{ x: x1, y: y1 }, { x: x1, y: start }, { x: gutter, y: start }, { x: gutter, y: end },
        { x: x2, y: end }, { x: x2, y: y2 }];
    }
    return [{ edge, from, to, path: roundedPath(points) }];
  });
}

function roundedPath(points: Point[]) {
  const [first, ...rest] = points;
  let path = `M ${first.x} ${first.y}`;
  for (const [index, corner] of rest.entries()) {
    const next = rest[index + 1];
    if (!next) return `${path} L ${corner.x} ${corner.y}`;
    const previous = points[index];
    const incoming = Math.hypot(previous.x - corner.x, previous.y - corner.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(12, incoming / 2, outgoing / 2);
    if (!radius) continue;
    const beforeX = corner.x + (previous.x - corner.x) / incoming * radius;
    const beforeY = corner.y + (previous.y - corner.y) / incoming * radius;
    const afterX = corner.x + (next.x - corner.x) / outgoing * radius;
    const afterY = corner.y + (next.y - corner.y) / outgoing * radius;
    path += ` L ${beforeX} ${beforeY} Q ${corner.x} ${corner.y} ${afterX} ${afterY}`;
  }
  return path;
}
