import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/forms";
import { campaignsService } from "@/services";
import type { Campaign } from "@/types/domain";

export default function CampaignsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    campaignsService.listCampaigns().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Кампании</h1>
          <p className="text-[13px] text-ink-muted">Outreach sequences без реальной отправки</p>
        </div>
        <Button onClick={() => navigate("/app/campaigns/cmp1")}>Открыть пример</Button>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-24" />
      ) : items.length === 0 ? (
        <div className="mt-16 text-center text-[13px] text-ink-muted">
          Кампаний нет. Соберите последовательность писем на аудиторию.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-line">
          <div className="grid grid-cols-[1.4fr_1fr_90px_80px_80px_90px_100px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
            <span>Campaign</span>
            <span>Audience</span>
            <span>Contacts</span>
            <span>Sent</span>
            <span>Replies</span>
            <span>Positive</span>
            <span>Status</span>
          </div>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="grid w-full grid-cols-[1.4fr_1fr_90px_80px_80px_90px_100px] items-center border-t border-line px-3 py-3 text-left text-[13px] hover:bg-row-hover"
              onClick={() => navigate(`/app/campaigns/${item.id}`)}
            >
              <span>{item.name}</span>
              <span className="text-ink-muted">{item.audienceName}</span>
              <span>{item.contacts}</span>
              <span>{item.sent}</span>
              <span>{item.replies}</span>
              <span>{item.positive}</span>
              <Badge tone={item.status === "active" ? "green" : "neutral"}>{item.status}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
