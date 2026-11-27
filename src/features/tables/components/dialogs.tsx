import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export { ExportDialog, ImportWizard } from "@/features/tables/components/csv-import-wizard";

export function RunConfirmDialog({
  open,
  onOpenChange,
  rows,
  candidates,
  running,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: number;
  candidates: number;
  running?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Запустить обогащение?">
        <div className="space-y-1 text-[13px]">
          <div>Выбрано строк: {rows}</div>
          <div>Кандидаты с заполненным ИНН / ОГРН: {candidates}</div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={running}>
            Отмена
          </Button>
          <Button variant="accent" disabled={running || candidates === 0} onClick={() => onConfirm()}>
            {running ? "Обогащение выполняется…" : "Запустить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
