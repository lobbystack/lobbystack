import type { BusinessContextSnapshot } from "@ai-receptionist/shared";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { KnowledgeManager } from "@/features/knowledge/KnowledgeManager";
import { PreviewPanel } from "@/features/knowledge/PreviewPanel";
import { BusinessProfileForm } from "@/features/settings/BusinessProfileForm";
import { BusinessSnapshotCard } from "@/features/settings/BusinessSnapshotCard";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { useTranslation } from "react-i18next";

type AgentPageProps = {
  businessId?: Id<"businesses">;
  snapshot: BusinessContextSnapshot;
};

export function AgentPage({ businessId, snapshot }: AgentPageProps) {
  const { t } = useTranslation("agent");

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("page.title")}</h1>
        <p className="text-muted-foreground">{t("page.description")}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <BusinessProfileForm businessId={businessId} />
        <BusinessSnapshotCard snapshot={snapshot} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <KnowledgeManager businessId={businessId} />
        <PreviewPanel businessId={businessId} enabled />
      </div>
    </div>
  );
}
