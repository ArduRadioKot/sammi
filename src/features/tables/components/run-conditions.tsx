import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/forms";
import type { FilterOperator, FilterRule, ColumnDefinition } from "@/types/domain";
import { operatorLabel } from "@/features/tables/lib/query";

const OPERATORS: FilterOperator[] = [
  "gt",
  "gte",
  "lt",
  "lte",
  "eq",
  "contains",
  "is_empty",
  "is_not_empty",
];

export function RunConditions({
  columns,
  conditions,
  onChange,
}: {
  columns: ColumnDefinition[];
  conditions: FilterRule[];
  onChange: (conditions: FilterRule[]) => void;
}) {
  const add = () => {
    onChange([
      ...conditions,
      {
        id: `c_${Date.now()}`,
        columnId: columns[0]?.id ?? "employees",
        operator: "gt",
        value: 100,
      },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="text-[12px] font-medium text-ink-muted">Run if</div>
      {conditions.map((condition, index) => (
        <div key={condition.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1.5">
          {index > 0 && (
            <div className="col-span-4 text-[11px] text-ink-faint">AND</div>
          )}
          <select
            className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]"
            value={condition.columnId}
            onChange={(event) =>
              onChange(
                conditions.map((item) =>
                  item.id === condition.id ? { ...item, columnId: event.target.value } : item,
                ),
              )
            }
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
          <select
            className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]"
            value={condition.operator}
            onChange={(event) =>
              onChange(
                conditions.map((item) =>
                  item.id === condition.id
                    ? { ...item, operator: event.target.value as FilterOperator }
                    : item,
                ),
              )
            }
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>
                {operatorLabel[op]}
              </option>
            ))}
          </select>
          <Input
            value={String(condition.value ?? "")}
            onChange={(event) =>
              onChange(
                conditions.map((item) =>
                  item.id === condition.id ? { ...item, value: event.target.value } : item,
                ),
              )
            }
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(conditions.filter((item) => item.id !== condition.id))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add}>
        + Add condition
      </Button>
    </div>
  );
}
