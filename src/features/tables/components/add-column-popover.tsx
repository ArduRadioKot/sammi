import {
  Binary,
  Braces,
  Calendar,
  CheckSquare,
  Globe,
  Hash,
  Link2,
  Mail,
  Phone,
  Plus,
  Sparkles,
  Type,
  Webhook,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/forms";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import type { ColumnType } from "@/types/domain";

const BASIC: Array<{ type: ColumnType; label: string; icon: typeof Type }> = [
  { type: "text", label: "Text", icon: Type },
  { type: "number", label: "Number", icon: Hash },
  { type: "date", label: "Date", icon: Calendar },
  { type: "boolean", label: "Checkbox", icon: CheckSquare },
  { type: "url", label: "URL", icon: Globe },
  { type: "email", label: "Email", icon: Mail },
  { type: "phone", label: "Phone", icon: Phone },
  { type: "select", label: "Select", icon: Binary },
];

const POWER = [
  { id: "formula", label: "Formula", icon: Braces },
  { id: "relation", label: "Relation", icon: Link2 },
  { id: "lookup", label: "Lookup", icon: Link2 },
  { id: "conditional", label: "Conditional", icon: CheckSquare },
];

const DATA = [
  { id: "enrichment", label: "Enrichment", icon: Sparkles },
  { id: "waterfall", label: "Waterfall", icon: Sparkles },
];

const AI = [
  { id: "ai", label: "AI Column", icon: Sparkles },
  { id: "agent", label: "AI Research Agent", icon: Sparkles },
];

const AUTO = [
  { id: "http", label: "HTTP Request", icon: Globe },
  { id: "webhook", label: "Webhook", icon: Webhook },
];

export function AddColumnPopover({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const match = (label: string) => label.toLowerCase().includes(q);
    return [
      { title: "BASIC", items: BASIC.filter((item) => match(item.label)).map((item) => ({ id: item.type, label: item.label, icon: item.icon })) },
      { title: "POWER", items: POWER.filter((item) => match(item.label)) },
      { title: "DATA", items: DATA.filter((item) => match(item.label)) },
      { title: "AI", items: AI.filter((item) => match(item.label)) },
      { title: "AUTOMATION", items: AUTO.filter((item) => match(item.label)) },
    ].filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Добавить колонку">
          <Plus className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <Input
          autoFocus
          placeholder="Search column types..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="mt-2 max-h-80 space-y-2 overflow-auto">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="px-1 pb-1 text-[10px] tracking-wider text-ink-faint">{group.title}</div>
              {group.items.map((item) => {
                const upcoming = group.title !== "BASIC" && item.id !== "enrichment";
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={upcoming}
                    className={`flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[13px] ${
                      upcoming ? "cursor-not-allowed text-ink-faint" : "hover:bg-surface-1"
                    }`}
                    onClick={() => {
                      if (upcoming) return;
                      onSelect(item.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <item.icon className="size-3.5 text-ink-muted" />
                    <span className="flex-1">{item.label}</span>
                    {upcoming ? <span className="text-[11px] text-ink-faint">Скоро</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
