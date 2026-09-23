import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/forms";
import { campaignsService } from "@/services";
import type { Campaign } from "@/types/domain";

export default function CampaignDetailsPage() {
  const { id = "" } = useParams();
  const [campaign, setCampaign] = useState<Campaign | undefined>();
  const [tab, setTab] = useState<"overview" | "sequence" | "people" | "analytics">("sequence");

  useEffect(() => {
    campaignsService.getCampaign(id).then(setCampaign);
  }, [id]);

  if (!campaign) {
    return (
      <div className="p-5">
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-5">
      <div className="text-[12px] text-ink-muted">Campaigns / {campaign.name}</div>
      <h1 className="mt-1 text-[22px] font-medium tracking-[-0.03em]">{campaign.name}</h1>
      <div className="mt-3 flex gap-2">
        {(["overview", "sequence" , "people", "analytics"] as const).map((item) => (
          <Button key={item} size="sm" variant={tab === item ? "secondary" : "ghost"} onClick={() => setTab(item)}>
            {item}
          </Button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Contacts", campaign.contacts],
            ["Sent", campaign.sent],
            ["Replies", campaign.replies],
            ["Positive", campaign.positive],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="text-[11px] text-ink-muted">{label}</div>
              <div className="mt-1 text-[22px]">{value}</div>
            </div>
          ))}
        </div>
      )}
      {tab === "sequence" && (
        <div className="mt-4 max-w-xl space-y-3">
          {campaign.steps.map((step, index) => (
            <div key={step.id} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="text-[11px] text-ink-faint">
                Step {index + 1} · {step.type}
              </div>
              {step.type === "wait" ? (
                <div className="mt-1 text-[13px]">Wait {step.waitDays} days</div>
              ) : (
                <>
                  <div className="mt-1 text-[13px] font-medium">{step.subject}</div>
                  <div className="mt-1 text-[13px] text-ink-muted">{step.body}</div>
                </>
              )}
            </div>
          ))}
          <p className="text-[12px] text-ink-muted">
            Variables: {"{{firstName}}"} {"{{company}}"} {"{{aiResearch}}"}
          </p>
        </div>
      )}
      {tab === "people" && <p className="mt-4 text-[13px]">Контакты аудитории {id}</p>}
      {tab === "analytics" && (
        <p className="mt-4 text-[13px]">
          Replies {campaign.replies} · Positive {campaign.positive}
        </p>
      )}
    </div>
  );
}
