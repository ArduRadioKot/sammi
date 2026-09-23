import { createDemoTable } from "@/lib/mock/data";
import { cn } from "@/lib/utils";

export type ProductStageId = "table" | "email" | "waterfall" | "found" | "ai" | "signals" | "crm";

export function ProductPreview({ stage = "table" }: { stage?: ProductStageId }) {
  const table = createDemoTable();
  const rows = table.rows.slice(0, 8);
  const columns = table.columns.filter((column) =>
    ["company", "email", "aiResearch", "intent", "score", "crm"].includes(column.id),
  );

  return (
    <div className="overflow-hidden rounded-[16px] border border-[rgba(231,238,234,0.12)] bg-[#101916] shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between border-b border-[rgba(231,238,234,0.08)] px-4 py-2.5 text-[12px]">
        <span>Российские SaaS-компании</span>
        <span className="text-ink-faint">180 rows · GTM Russia</span>
      </div>
      {stage === "waterfall" && (
        <div className="border-b border-[rgba(231,238,234,0.08)] px-4 py-3 text-[12px]">
          Waterfall · DaData → Контур → ЕГРЮЛ
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-[12px]">
          <thead className="text-ink-faint">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={cn(
                    "border-b border-[rgba(231,238,234,0.08)] px-3 py-2 font-medium",
                    stage === "email" && column.id === "email" && "bg-[rgba(94,181,170,0.12)] text-ink",
                  )}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const qualified =
                Number(row.cells.score?.value) > 80 &&
                row.cells.intent?.value === "High";
              const dim = (stage === "signals" || stage === "crm") && !qualified;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-[rgba(231,238,234,0.06)]",
                    dim && "opacity-25",
                    stage === "crm" && qualified && index === 0 && "bg-[rgba(94,181,170,0.08)]",
                  )}
                >
                  {columns.map((column) => {
                    const cell = row.cells[column.id];
                    let value = String(cell?.value ?? "");
                    if (column.id === "email") {
                      if (stage === "email") value = "";
                      if (stage === "waterfall") value = "searching…";
                      if (["found", "ai", "signals", "crm"].includes(stage) && !value) {
                        value = `sales@${String(row.cells.domain?.value ?? "company.ru")}`;
                      }
                    }
                    if (column.id === "aiResearch" && ["table", "email", "waterfall", "found"].includes(stage)) {
                      value = "";
                    }
                    if (column.id === "crm" && stage === "crm" && qualified) value = "amoCRM";
                    return (
                      <td key={column.id} className="truncate px-3 py-2.5">
                        {value || <span className="text-ink-faint">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
