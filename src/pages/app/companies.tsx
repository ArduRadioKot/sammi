import { useEffect, useMemo, useState } from "react";
import { Input, Skeleton } from "@/components/ui/forms";
import { companiesService } from "@/services";
import type { Company } from "@/types/domain";
import { formatCurrencyRub, formatNumber, initials } from "@/lib/utils";
import { Sheet } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { stakeholderRepository, type StakeholderAccount } from "@/features/stakeholders/repository";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("all");
  const [selected, setSelected] = useState<Company | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<StakeholderAccount[]>([]);

  useEffect(() => {
    companiesService.listCompanies().then((items) => {
      setCompanies(items);
      setLoading(false);
    });
    void stakeholderRepository.listAccounts().then(setDemoAccounts);
  }, []);

  const industries = useMemo(
    () => ["all", ...Array.from(new Set(companies.map((item) => item.industry)))],
    [companies],
  );

  const filtered = useMemo(
    () =>
      companies.filter((company) => {
        const matchesQuery = `${company.name} ${company.domain} ${company.city}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesIndustry = industry === "all" || company.industry === industry;
        return matchesQuery && matchesIndustry;
      }),
    [companies, query, industry],
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Компании</h1>
          <p className="text-[13px] text-ink-muted">{filtered.length} записей</p>
        </div>
        <div className="flex gap-2">
          <select
            className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[13px]"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          >
            {industries.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "Все отрасли" : item}
              </option>
            ))}
          </select>
          <Input className="w-64" placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <section className="shrink-0 rounded-[var(--radius-md)] border border-line bg-surface-0 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div><h2 className="text-[13px] font-medium">Карта ЛПР · демонстрационные клиенты</h2><p className="text-[11px] text-ink-muted">Вымышленные компании. Изменения сохраняются локально в браузере.</p></div>
          <span className="rounded bg-warning-soft px-2 py-1 text-[10px] text-warning">Mock CRM</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {demoAccounts.map((account) => <Link key={account.id} to={`/app/companies/${account.id}/stakeholders`} className="flex min-h-12 items-center justify-between gap-2 rounded border border-line px-3 py-2 hover:bg-surface-1"><span className="min-w-0"><span className="block truncate text-[12px] font-medium">{account.name}</span><span className="block text-[10px] text-ink-muted">{account.industry} · 18 участников</span></span><span aria-hidden className="text-accent">→</span></Link>)}
        </div>
      </section>
      <div className="flex min-h-[220px] flex-1 flex-col overflow-auto rounded-[var(--radius-md)] border border-line">
        <div className="grid grid-cols-[1.4fr_140px_100px_110px_90px_120px_80px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
          <span>Company</span>
          <span>Industry</span>
          <span>City</span>
          <span>Employees</span>
          <span>Intent</span>
          <span>Revenue</span>
          <span>Score</span>
        </div>
        {loading ? (
          <div className="p-3">
            <Skeleton className="h-8" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-ink-muted">Компаний пока нет.</div>
        ) : (
          filtered.slice(0, 120).map((company) => (
            <button
              key={company.id}
              type="button"
              className="grid w-full grid-cols-[1.4fr_140px_100px_110px_90px_120px_80px] items-center border-t border-line px-3 py-2 text-left text-[13px] hover:bg-row-hover"
              onClick={() => setSelected(company)}
            >
              <span className="flex items-center gap-2 truncate">
                <span className="flex size-5 items-center justify-center rounded-[4px] bg-surface-2 text-[10px]">
                  {initials(company.name)}
                </span>
                {company.name}
              </span>
              <span>{company.industry}</span>
              <span className="text-ink-muted">{company.city}</span>
              <span>{formatNumber(company.employees)}</span>
              <span>{company.intent}</span>
              <span className="text-ink-muted">{formatCurrencyRub(company.revenue)}</span>
              <span>{company.score}</span>
            </button>
          ))
        )}
      </div>
      <Sheet open={Boolean(selected)} onOpenChange={() => setSelected(null)} title="Company">
        {selected && (
          <div className="space-y-2 text-[13px]">
            <div className="text-[16px] font-medium">{selected.name}</div>
            <div className="text-ink-muted">
              {selected.domain} · {selected.city}
            </div>
            <div>ИНН {selected.inn}</div>
            <div>ОГРН {selected.ogrn}</div>
            <div>{selected.aiResearch || "AI research не запускался"}</div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
