import { useEffect, useMemo, useState } from "react";
import { Input, Skeleton } from "@/components/ui/forms";
import { peopleService } from "@/services";
import type { Person } from "@/types/domain";
import { Sheet } from "@/components/ui/dialog";
import { initials } from "@/lib/utils";

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);

  useEffect(() => {
    peopleService.listPeople().then((items) => {
      setPeople(items);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(
    () =>
      people.filter((person) =>
        `${person.name} ${person.companyName} ${person.role}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [people, query],
  );

  return (
    <div className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Люди</h1>
          <p className="text-[13px] text-ink-muted">База ЛПР, не CRM-воронка</p>
        </div>
        <Input className="w-64" placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="mt-4 flex-1 overflow-auto rounded-[var(--radius-md)] border border-line">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_160px_140px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
          <span>Name</span>
          <span>Role</span>
          <span>Company</span>
          <span>City</span>
          <span>Source</span>
        </div>
        {loading ? (
          <div className="p-3">
            <Skeleton className="h-8" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-ink-muted">Людей пока нет.</div>
        ) : (
          filtered.map((person) => (
            <button
              key={person.id}
              type="button"
              className="grid w-full grid-cols-[1.2fr_1fr_1fr_160px_140px] items-center border-t border-line px-3 py-2 text-left text-[13px] hover:bg-row-hover"
              onClick={() => setSelected(person)}
            >
              <span className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-surface-2 text-[10px]">
                  {initials(person.name)}
                </span>
                {person.name}
              </span>
              <span>{person.role}</span>
              <span className="text-ink-muted">{person.companyName}</span>
              <span>{person.city}</span>
              <span className="text-ink-muted">{person.source}</span>
            </button>
          ))
        )}
      </div>
      <Sheet open={Boolean(selected)} onOpenChange={() => setSelected(null)} title="Person">
        {selected && (
          <div className="space-y-2 text-[13px]">
            <div>{selected.name}</div>
            <div className="text-ink-muted">
              {selected.role} · {selected.companyName}
            </div>
            <div>{selected.email}</div>
            <div>{selected.city}</div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
