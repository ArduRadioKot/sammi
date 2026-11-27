import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Skeleton } from "@/components/ui/forms";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { tablesService } from "@/services";
import { formatNumber } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import { MoreHorizontal } from "lucide-react";
import type { DataTable, TableType } from "@/types/domain";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Controller, useForm } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTableSchema, type CreateTableForm } from "@/lib/schemas";
import { useAuthStore } from "@/stores/auth-store";
import { ImportWizard } from "@/features/tables/components/csv-import-wizard";

export default function TablesPage() {
  const navigate = useNavigate();
  const workspace = useAuthStore((s) => s.workspace);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | TableType>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const createForm = useForm<CreateTableForm>({
    resolver: zodResolver(createTableSchema),
    defaultValues: { name: "Новая таблица", type: "companies" },
  });

  const workspaceId = workspace?.id;

  const reload = () => {
    if (!workspaceId) return Promise.resolve();
    return tablesService.listTables(workspaceId).then(setTables);
  };

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    tablesService.listTables(workspaceId).then((items) => {
      if (cancelled) return;
      setTables(items);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const filtered = useMemo(() => {
    return tables.filter((table) => {
      const matchesTab = tab === "all" || table.type === tab;
      const matchesQuery = table.name.toLowerCase().includes(query.toLowerCase());
      return matchesTab && matchesQuery;
    });
  }, [tables, tab, query]);

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-medium tracking-[-0.03em]">Таблицы</h1>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)}>Создать таблицу</Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            Import
          </Button>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {(["all", "people", "companies", "custom"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`h-8 rounded-[var(--radius-sm)] px-2.5 text-[13px] ${
                tab === item ? "bg-surface-1" : "text-ink-muted"
              }`}
            >
              {item === "all" ? "Все" : item === "people" ? "Люди" : item === "companies" ? "Компании" : "Custom"}
            </button>
          ))}
        </div>
        <Input
          className="w-64"
          placeholder="Поиск"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-line">
        <div className="grid grid-cols-[1.5fr_120px_80px_160px_40px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
          <span>Name</span>
          <span>Type</span>
          <span>Rows</span>
          <span>Updated</span>
          <span />
        </div>
        {loading ? (
          <div className="p-3">
            <Skeleton className="h-8" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-[14px] font-medium">У вас пока нет таблиц</div>
            <p className="mt-1 text-[13px] text-ink-muted">Создайте таблицу — колонки и строки сохранятся в workspace.</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Создать таблицу
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                Import CSV
              </Button>
            </div>
          </div>
        ) : (
          filtered.map((table) => (
            <div
              key={table.id}
              className="grid grid-cols-[1.5fr_120px_80px_160px_40px] items-center border-t border-line px-3 py-2 text-[13px]"
            >
              <Link to={`/app/tables/${table.id}`} className="truncate hover:underline">
                {table.name}
              </Link>
              <span className="text-ink-muted">{table.relationshipSourceId ? "Анализ" : table.type}</span>
              <span>{formatNumber(table.rowCount)}</span>
              <span className="text-ink-muted">
                {formatDistanceToNow(new Date(table.updatedAt), { addSuffix: true, locale: ruLocale })}
              </span>
              {!table.relationshipSourceId && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex size-8 items-center justify-center">
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onSelect={async () => {
                        const next = window.prompt("Название таблицы", table.name);
                        if (!next || next === table.name) return;
                        try {
                          await tablesService.updateTable(table.id, { name: next });
                          await reload();
                        } catch {
                          toast.error("Не удалось переименовать таблицу");
                        }
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={async () => {
                        if (!window.confirm(`Удалить таблицу «${table.name}» вместе с колонками и строками?`)) return;
                        try {
                          await tablesService.deleteTable(table.id);
                          await reload();
                          toast.success("Удалено");
                        } catch {
                          toast.error("Не удалось удалить таблицу");
                        }
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))
        )}
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="Новая таблица">
          <form
            onSubmit={createForm.handleSubmit(async (values) => {
              if (!workspace) {
                toast.error("Workspace не загружен");
                return;
              }
              try {
                const created = await tablesService.createTable(workspace.id, values);
                toast.success("Таблица создана");
                setCreateOpen(false);
                createForm.reset();
                navigate(`/app/tables/${created.id}`);
              } catch {
                toast.error("Не удалось создать таблицу");
              }
            })}
          >
            <Label htmlFor="table-name">Название</Label>
            <Input id="table-name" className="mt-1" {...createForm.register("name")} />
            {createForm.formState.errors.name && (
              <p className="mt-1 text-[12px] text-danger">{createForm.formState.errors.name.message}</p>
            )}
            <Label className="mt-3 block" htmlFor="table-type">
              Тип
            </Label>
            <Controller
              name="type"
              control={createForm.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="table-type" ref={field.ref} onBlur={field.onBlur} className="mt-1 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="companies">Компании</SelectItem>
                    <SelectItem value="people">Люди</SelectItem>
                    <SelectItem value="custom">Своя структура</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <Button className="mt-3" type="submit">
              Создать
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        mode="workspace"
        onImported={() => {
          void reload();
        }}
      />
    </div>
  );
}
