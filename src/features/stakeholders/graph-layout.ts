import type { StakeholderContact, StakeholderEdge } from "./repository";

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
type Node = Point & { column: number; row: number; contact: StakeholderContact };

export const CARD = { width: 224, height: 76 };
const COLUMN_STEP = CARD.width + 80;
const ROW_STEP = CARD.height + 50;
const LEFT = 20;
const TOP = 72;

export function layoutGraph(contacts: StakeholderContact[], departments: readonly string[]) {
  const groups = new Map<string, StakeholderContact[]>();
  for (const contact of contacts) {
    const department = contact.department || "Без подразделения";
    const group = groups.get(department) ?? [];
    group.push(contact);
    groups.set(department, group);
  }

  const names = [...new Set([...departments, ...groups.keys()])].filter((name) => groups.has(name));
  const nodes = new Map<string, Node>();
  let rowCount = 1;
  const columns = names.map((name, column) => {
    const x = LEFT + CARD.width / 2 + column * COLUMN_STEP;
    const group = groups.get(name) ?? [];
    group.forEach((contact, row) => {
      nodes.set(contact.id, { x, y: TOP + CARD.height / 2 + row * ROW_STEP, column, row, contact });
    });
    rowCount = Math.max(rowCount, group.length);
    return { name, x };
  });

  return {
    columns,
    nodes,
    size: {
      width: LEFT + Math.max(0, columns.length - 1) * COLUMN_STEP + CARD.width + 66,
      height: TOP + (rowCount - 1) * ROW_STEP + CARD.height + 54,
    },
  };
}

function spread(index: number, count: number, span: number, maxStep: number) {
  const step = Math.min(maxStep, span / Math.max(1, count - 1));
  return (index - (count - 1) / 2) * step;
}

export function routeEdges(edges: StakeholderEdge[], nodes: Map<string, Node>) {
  const ports = new Map<string, { id: string; targetY: number }[]>();
  const routes = edges.flatMap((edge) => {
    const from = nodes.get(edge.fromId);
    const to = nodes.get(edge.toId);
    if (!from || !to || from === to) return [];
    const sameColumn = from.column === to.column;
    const direction = from.column < to.column || sameColumn ? 1 : -1;
    const fromPort = `${from.contact.id}:${direction}`;
    const toPort = `${to.contact.id}:${sameColumn ? direction : -direction}`;
    for (const [port, targetY] of [[fromPort, to.y], [toPort, from.y]] as const) {
      const connections = ports.get(port) ?? [];
      connections.push({ id: edge.id, targetY });
      ports.set(port, connections);
    }
    return [{ edge, from, to, sameColumn, direction, fromPort, toPort }];
  });
  for (const connections of ports.values()) connections.sort((a, b) => a.targetY - b.targetY);

  const portY = (node: Node, port: string, edgeId: string) => {
    const connections = ports.get(port) ?? [];
    const index = connections.findIndex(({ id }) => id === edgeId);
    return node.y + spread(index, connections.length, 52, 14);
  };

  return routes.map(({ edge, from, to, sameColumn, direction, fromPort, toPort }, index) => {
    const startX = from.x + direction * CARD.width / 2;
    const endX = to.x + (sameColumn ? direction : -direction) * CARD.width / 2;
    const startY = portY(from, fromPort, edge.id);
    const endY = portY(to, toPort, edge.id);
    const lane = 26 + (index % 5) * 6;
    const exitX = startX + direction * (lane + (startY - from.y) * 0.23);
    const entryX = endX - direction * (lane + (endY - to.y) * 0.23);

    let path: string;
    if (sameColumn) {
      path = roundedPath([{ x: startX, y: startY }, { x: exitX, y: startY }, { x: exitX, y: endY }, { x: endX, y: endY }]);
    } else if (Math.abs(from.column - to.column) === 1) {
      path = `M ${startX} ${startY} C ${exitX} ${startY} ${entryX} ${endY} ${endX} ${endY}`;
    } else {
      // Department columns share the row baselines, so a cross-column edge can use a gap between rows.
      const laneRow = Math.floor((from.row + to.row) / 2);
      const laneY = TOP + (laneRow + 1) * ROW_STEP - 44 + (index % 6) * 7;
      path = roundedPath([
        { x: startX, y: startY }, { x: exitX, y: startY }, { x: exitX, y: laneY },
        { x: entryX, y: laneY }, { x: entryX, y: endY }, { x: endX, y: endY },
      ]);
    }
    return { edge, from, to, path };
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
