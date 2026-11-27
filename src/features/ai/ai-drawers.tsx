import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/forms";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { aiModels } from "@/lib/mock/providers";
import type {
  AIColumnConfig,
  AIOutputType,
  AIProviderId,
  AgentConfig,
  ColumnDefinition,
  FilterRule,
  FormulaConfig,
  SchemaField,
} from "@/types/domain";
import { RunConditions } from "@/features/tables/components/run-conditions";

const VARIABLES = ["Company", "Domain", "Industry", "Revenue", "Employees", "City"];

export function AiColumnDrawer({
  open,
  onOpenChange,
  columns,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnDefinition[];
  onSave: (config: AIColumnConfig, run: boolean) => void;
}) {
  const [prompt, setPrompt] = useState(
    "Изучи сайт {{Company.Domain}} и определи основной продукт компании. Верни результат в 1–2 предложениях.",
  );
  const [providerId, setProviderId] = useState<AIProviderId>("yandex");
  const [modelId, setModelId] = useState("yandexgpt-5-pro");
  const [outputType, setOutputType] = useState<AIOutputType>("text");
  const [webResearch, setWebResearch] = useState(true);
  const [useWebsite, setUseWebsite] = useState(true);
  const [showVars, setShowVars] = useState(false);
  const [conditions, setConditions] = useState<FilterRule[]>([]);

  const models = useMemo(
    () => aiModels.filter((model) => model.providerId === providerId),
    [providerId],
  );

  const config = (): AIColumnConfig => ({
    kind: "ai",
    providerId,
    modelId,
    prompt,
    outputType,
    webResearch,
    useCompanyWebsite: useWebsite,
    conditions,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="AI Column" width={500}>
      <Label>Prompt</Label>
      <div className="relative mt-1">
        <Textarea
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setShowVars(event.target.value.endsWith("@"));
          }}
        />
        {showVars && (
          <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded-[var(--radius-md)] border border-line bg-surface-0 p-1 shadow-[var(--shadow-float)]">
            {VARIABLES.map((variable) => (
              <button
                key={variable}
                type="button"
                className="block w-full rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] hover:bg-surface-1"
                onClick={() => {
                  setPrompt((current) => `${current.slice(0, -1)}{{${variable}}}`);
                  setShowVars(false);
                }}
              >
                {variable}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <Label>Provider</Label>
          <Select
            value={providerId}
            onValueChange={(value) => {
              const next = value as AIProviderId;
              setProviderId(next);
              const first = aiModels.find((model) => model.providerId === next);
              if (first) setModelId(first.id);
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yandex">YandexGPT</SelectItem>
              <SelectItem value="gigachat">GigaChat</SelectItem>
              <SelectItem value="ollama">Ollama</SelectItem>
              <SelectItem value="custom">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Model</Label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-3">
        <Label>Output</Label>
        <Select value={outputType} onValueChange={(value) => setOutputType(value as AIOutputType)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="boolean">Boolean</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="json">JSON / Structured</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-4 space-y-3">
        <label className="flex items-center justify-between text-[13px]">
          Web research
          <Switch checked={webResearch} onCheckedChange={setWebResearch} />
        </label>
        <label className="flex items-center justify-between text-[13px]">
          Use company website
          <Switch checked={useWebsite} onCheckedChange={setUseWebsite} />
        </label>
      </div>
      <div className="mt-4">
        <RunConditions columns={columns} conditions={conditions} onChange={setConditions} />
      </div>
      <div className="mt-4 rounded-[var(--radius-md)] bg-surface-1 p-3 text-[12px]">
        <div className="text-ink-muted">Preview</div>
        <div className="mt-2">Input: Яндекс / yandex.ru</div>
        <div className="mt-1 text-ink-muted">{prompt}</div>
        <div className="mt-2">Mock output: Яндекс развивает поисковые, облачные и рекламные продукты для B2B и B2C.</div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => onSave(config(), false)}>
          Save
        </Button>
        <Button className="flex-1" onClick={() => onSave(config(), true)}>
          Save & run 10 rows
        </Button>
      </div>
    </Sheet>
  );
}

export function FormulaDrawer({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: FormulaConfig) => void;
}) {
  const [expression, setExpression] = useState('IF({Employees} > 100, "Enterprise", "SMB")');
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Formula">
      <Label>Expression</Label>
      <textarea
        className="mt-1 min-h-28 w-full rounded-[var(--radius-sm)] border border-line bg-surface-1 p-3 font-mono text-[13px]"
        value={expression}
        onChange={(event) => setExpression(event.target.value)}
      />
      <div className="mt-3 text-[12px] text-ink-muted">
        Variables: Employees, Revenue, Industry, Intent, Score
      </div>
      <div className="mt-3 rounded-[var(--radius-md)] bg-surface-1 p-3 text-[13px]">
        Preview: Enterprise
      </div>
      <Button className="mt-4 w-full" onClick={() => onSave({ kind: "formula", expression })}>
        Сохранить формулу
      </Button>
    </Sheet>
  );
}

export function AgentDrawer({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: AgentConfig) => void;
}) {
  const [name, setName] = useState("Company Research");
  const [instructions, setInstructions] = useState(
    "Исследуй компанию и верни структурированное описание продукта.",
  );
  const [schema, setSchema] = useState<SchemaField[]>([
    { id: "product", name: "product", type: "string", description: "Основной продукт", required: true },
    { id: "target_market", name: "target_market", type: "string", description: "Рынок", required: true },
    { id: "has_enterprise", name: "has_enterprise", type: "boolean", description: "Enterprise", required: false },
    { id: "confidence", name: "confidence", type: "number", description: "0-1", required: true },
  ]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="AI Research Agent" width={500}>
      <Label>Agent name</Label>
      <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
      <Label className="mt-3 block">Instructions</Label>
      <Textarea className="mt-1" value={instructions} onChange={(event) => setInstructions(event.target.value)} />
      <div className="mt-4 text-[12px] font-medium text-ink-muted">Sources</div>
      <div className="mt-1 text-[13px] text-ink-muted">
        Company website · Search engine · News · HeadHunter · Telegram · Custom URL
      </div>
      <div className="mt-4 text-[12px] font-medium text-ink-muted">Tools</div>
      <div className="mt-1 text-[13px] text-ink-muted">
        Web search · Extract page · Read website · Structured output
      </div>
      <div className="mt-4 text-[12px] font-medium">Output schema</div>
      <div className="mt-2 space-y-2">
        {schema.map((field) => (
          <div key={field.id} className="grid grid-cols-[1fr_90px_1fr_auto] gap-1.5">
            <Input
              value={field.name}
              onChange={(event) =>
                setSchema((current) =>
                  current.map((item) =>
                    item.id === field.id ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
            <select
              className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[12px]"
              value={field.type}
              onChange={(event) =>
                setSchema((current) =>
                  current.map((item) =>
                    item.id === field.id
                      ? { ...item, type: event.target.value as SchemaField["type"] }
                      : item,
                  ),
                )
              }
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
            <Input
              value={field.description}
              onChange={(event) =>
                setSchema((current) =>
                  current.map((item) =>
                    item.id === field.id ? { ...item, description: event.target.value } : item,
                  ),
                )
              }
            />
            <label className="flex items-center gap-1 text-[11px] text-ink-muted">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(event) =>
                  setSchema((current) =>
                    current.map((item) =>
                      item.id === field.id ? { ...item, required: event.target.checked } : item,
                    ),
                  )
                }
              />
              req
            </label>
          </div>
        ))}
      </div>
      <Button
        className="mt-4 w-full"
        onClick={() =>
          onSave({
            name,
            instructions,
            providerId: "yandex",
            modelId: "yandexgpt-5-pro",
            sources: ["website", "search", "news"],
            tools: ["web_search", "read_website", "structured_output"],
            outputSchema: schema,
          })
        }
      >
        Сохранить агента
      </Button>
    </Sheet>
  );
}
