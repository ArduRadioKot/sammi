import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useUiStore } from "@/stores/ui-store";
import type { CommandActionId } from "@/types/domain";

const ACTIONS: Array<{ id: CommandActionId; label: string; hint?: string }> = [
  { id: "create-table", label: "Создать таблицу" },
  { id: "import", label: "Импорт" },
  { id: "add-enrichment", label: "Добавить enrichment" },
  { id: "search-table", label: "Найти в таблице" },
  { id: "go-integrations", label: "Открыть интеграции" },
  { id: "create-audience", label: "Создать аудиторию" },
  { id: "create-signal", label: "Создать сигнал" },
  { id: "settings", label: "Настройки" },
];

export function CommandPalette() {
  const navigate = useNavigate();
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const dispatchCommand = useUiStore((s) => s.dispatchCommand);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const runAction = (id: CommandActionId) => {
    if (id === "go-integrations") navigate("/app/integrations");
    else if (id === "settings") navigate("/app/settings");
    else if (id === "create-audience") navigate("/app/audiences");
    else if (id === "create-signal") navigate("/app/signals");
    else if (id === "create-table") navigate("/app/tables");
    else if (id === "add-enrichment" || id === "import" || id === "search-table") {
      navigate("/app/tables");
    }
    dispatchCommand(id);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="Поиск таблиц, компаний, команд..." />
        <CommandList>
          <CommandEmpty className="px-3 py-6 text-[13px] text-ink-muted">
            Ничего не найдено
          </CommandEmpty>
          <CommandGroup heading="Действия">
            {ACTIONS.map((action) => (
              <CommandItem key={action.id} onSelect={() => runAction(action.id)}>
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
