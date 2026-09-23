import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/forms";

export { ExportDialog, ImportWizard } from "@/features/tables/components/csv-import-wizard";

export function CrmDialog({
  open,
  onOpenChange,
  count,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onSend: (crm: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Send to CRM">
        <p className="mb-3 text-[13px] text-ink-muted">Отправить {count} строк</p>
        <div className="grid gap-2">
          {["amoCRM", "Bitrix24", "1С"].map((crm) => (
            <Button
              key={crm}
              variant="secondary"
              onClick={() => {
                onSend(crm);
                onOpenChange(false);
              }}
            >
              {crm}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RunConfirmDialog({
  open,
  onOpenChange,
  rows,
  candidates,
  maxReservation,
  costPerSuccess,
  availableCredits,
  running,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: number;
  candidates: number;
  maxReservation: number;
  costPerSuccess: number;
  availableCredits: number | null;
  running?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Запустить enrichment?">
        <div className="space-y-1 text-[13px]">
          <div>Выбрано строк: {rows}</div>
          <div>Кандидаты с заполненным ИНН / ОГРН: {candidates}</div>
          <div>До {maxReservation} credits будет зарезервировано.</div>
          <div>{costPerSuccess} credit / successful result</div>
          <div>Списываются только успешные результаты.</div>
          <div className="text-ink-muted">Available: {availableCredits ?? "—"}</div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button variant="accent" disabled={running || candidates === 0} onClick={() => onConfirm()}>
            {running ? "Обогащение выполняется…" : "Запустить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectIntegrationDialog({
  open,
  onOpenChange,
  name,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onSave: () => void;
}) {
  const [key, setKey] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`${name}`}>
        <Label>API key</Label>
        <Input className="mt-1" value={key} onChange={(event) => setKey(event.target.value)} placeholder="не сохраняется" />
        <Label className="mt-3 block">Endpoint</Label>
        <Input className="mt-1" defaultValue="https://api.example.demo" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => toast.message("Test connection: mock OK")}>
            Test connection
          </Button>
          <Button
            onClick={() => {
              onSave();
              onOpenChange(false);
              setKey("");
            }}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
