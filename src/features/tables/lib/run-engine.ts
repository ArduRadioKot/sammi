import { useTableEditorStore } from "@/stores/table-editor-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CellValue, RunStatus } from "@/types/domain";

const MOCK_PRODUCTS = [
  "облачная платформа для B2B-операций",
  "SaaS для автоматизации продаж",
  "система аналитики и отчётности",
  "инфраструктурный сервис для разработчиков",
  "продукт для работы с корпоративными данными",
];

function mockEmail(domain: string, rowIndex: number): string {
  const slug = domain.split(".")[0] || "company";
  return `sales.${rowIndex}@${slug}.demo`;
}

function mockAi(company: string, domain: string, rowIndex: number): string {
  return `${company} (${domain}) развивает ${MOCK_PRODUCTS[rowIndex % MOCK_PRODUCTS.length]}.`;
}

function outcome(rowIndex: number): RunStatus {
  const mod = rowIndex % 10;
  if (mod === 8) return "not_found";
  if (mod === 9) return "error";
  if (mod === 7) return "skipped";
  return "success";
}

export async function runColumnSimulation(options: {
  columnId: string;
  kind: "enrichment" | "ai";
  limit: number;
  rowIds?: string[];
}) {
  const store = useTableEditorStore.getState();
  const table = store.table;
  if (!table) return;

  const ids = (options.rowIds ?? table.rows.map((row) => row.id)).slice(0, options.limit);
  const runId = `run_${Date.now()}`;
  store.setRun({
    id: runId,
    tableId: table.id,
    columnId: options.columnId,
    kind: options.kind,
    total: ids.length,
    completed: 0,
    creditsUsed: 0,
    providerCount: options.kind === "enrichment" ? 3 : 1,
    status: "running",
  });

  store.updateCells(
    ids.map((rowId) => ({
      rowId,
      columnId: options.columnId,
      patch: { status: "queued", error: undefined },
    })),
  );

  for (let i = 0; i < ids.length; i += 1) {
    const current = useTableEditorStore.getState().run;
    if (!current || current.id !== runId || current.status === "stopped") return;
    while (useTableEditorStore.getState().run?.status === "paused") {
      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    const rowId = ids[i];
    store.updateCell(rowId, options.columnId, { status: "running" });
    await new Promise((resolve) => setTimeout(resolve, 70 + (i % 3) * 30));

    const row = useTableEditorStore.getState().table?.rows.find((item) => item.id === rowId);
    const domain = String(row?.cells.domain?.value ?? "company.demo");
    const company = String(row?.cells.company?.value ?? "Компания");
    const status = outcome(i);
    const patch: Partial<CellValue> =
      status === "success"
        ? {
            status,
            value:
              options.kind === "ai"
                ? mockAi(company, domain, i)
                : mockEmail(domain, i),
            provenance: {
              providerId: options.kind === "ai" ? "yandex" : "dadata",
              providerName: options.kind === "ai" ? "YandexGPT" : "DaData → Контур",
              source: options.kind === "ai" ? "website" : "waterfall",
              updatedAt: new Date().toISOString(),
              confidence: 80 + (i % 15),
              credits: options.kind === "ai" ? 2 : 1,
            },
          }
        : {
            status,
            value: "",
            error:
              status === "error"
                ? { code: i % 2 === 0 ? "rate_limit" : "provider_unavailable", message: status === "error" ? "Provider unavailable" : "Error" }
                : status === "not_found"
                  ? { code: "no_data", message: "No data found" }
                  : undefined,
          };

    store.updateCell(rowId, options.columnId, patch);
    const credits = status === "success" ? (options.kind === "ai" ? 2 : 1) : 0;
    useWorkspaceStore.getState().spendCredits(credits);
    const latest = useTableEditorStore.getState().run;
    store.patchRun({ completed: i + 1, creditsUsed: (latest?.creditsUsed ?? 0) + credits });
  }

  const finished = useTableEditorStore.getState().run;
  if (finished && finished.id === runId && finished.status !== "stopped") {
    store.patchRun({ status: "completed" });
    setTimeout(() => {
      if (useTableEditorStore.getState().run?.id === runId) {
        store.setRun(null);
      }
    }, 1800);
  }
}
