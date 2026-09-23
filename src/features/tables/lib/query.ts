import type {
  FilterOperator,
  FilterRule,
  SortRule,
  TableRow,
} from "@/types/domain";

function cellValue(row: TableRow, columnId: string): unknown {
  return row.cells[columnId]?.value;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export function matchFilter(row: TableRow, rule: FilterRule): boolean {
  const raw = cellValue(row, rule.columnId);
  const empty = raw == null || raw === "";

  switch (rule.operator) {
    case "is_empty":
      return empty;
    case "is_not_empty":
      return !empty;
    case "eq":
      return asString(raw) === asString(rule.value);
    case "neq":
      return asString(raw) !== asString(rule.value);
    case "contains":
      return asString(raw).toLowerCase().includes(asString(rule.value).toLowerCase());
    case "not_contains":
      return !asString(raw).toLowerCase().includes(asString(rule.value).toLowerCase());
    case "gt":
      return asNumber(raw) > asNumber(rule.value);
    case "gte":
      return asNumber(raw) >= asNumber(rule.value);
    case "lt":
      return asNumber(raw) < asNumber(rule.value);
    case "lte":
      return asNumber(raw) <= asNumber(rule.value);
    default:
      return true;
  }
}

export function applyFilters(rows: TableRow[], filters: FilterRule[]): TableRow[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((rule) => matchFilter(row, rule)));
}

export function applySearch(rows: TableRow[], search: string): TableRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    Object.values(row.cells).some((cell) =>
      asString(cell.value).toLowerCase().includes(q),
    ),
  );
}

export function applySorts(rows: TableRow[], sorts: SortRule[]): TableRow[] {
  if (sorts.length === 0) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    for (const sort of sorts) {
      const av = cellValue(a, sort.columnId);
      const bv = cellValue(b, sort.columnId);
      const an = asNumber(av);
      const bn = asNumber(bv);
      let cmp = 0;
      if (!Number.isNaN(an) && !Number.isNaN(bn)) cmp = an - bn;
      else cmp = asString(av).localeCompare(asString(bv), "ru");
      if (cmp !== 0) return sort.direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
  return copy;
}

export const operatorLabel: Record<FilterOperator, string> = {
  eq: "равно",
  neq: "не равно",
  gt: "больше",
  gte: "не меньше",
  lt: "меньше",
  lte: "не больше",
  contains: "содержит",
  not_contains: "не содержит",
  is_empty: "пусто",
  is_not_empty: "не пусто",
};
