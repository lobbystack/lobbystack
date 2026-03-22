import type { BusinessContextSnapshot } from "@ai-receptionist/shared";
import type { LucideIcon } from "lucide-react";
import { BookOpenText, Sparkles, Waypoints } from "lucide-react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { KnowledgeManager } from "@/features/knowledge/KnowledgeManager";
import { PreviewPanel } from "@/features/knowledge/PreviewPanel";
import { BusinessProfileForm } from "@/features/settings/BusinessProfileForm";
import { BusinessSnapshotCard } from "@/features/settings/BusinessSnapshotCard";
import { useTranslation } from "react-i18next";

type AgentPageProps = {
  businessId?: Id<"businesses">;
  snapshot: BusinessContextSnapshot;
};

type WorkflowStep = {
  key: "behavior" | "knowledge" | "preview";
  icon: LucideIcon;
};

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
};

const workflowSteps: Array<WorkflowStep> = [
  { key: "behavior", icon: Waypoints },
  { key: "knowledge", icon: BookOpenText },
  { key: "preview", icon: Sparkles },
];

function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {eyebrow}
      </p>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function AgentPage({ businessId, snapshot }: AgentPageProps) {
  const { t } = useTranslation("agent");

  if (!businessId) {
    return (
      <div className="flex flex-col gap-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-[linear-gradient(140deg,rgba(255,255,255,0.98),rgba(247,247,245,0.98)_55%,rgba(236,253,245,0.9))] px-6 py-8 shadow-sm shadow-black/5 md:px-8 md:py-10">
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-foreground/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-8">
            <div className="max-w-3xl space-y-4">
              <Badge className="rounded-full bg-foreground px-3 py-1 text-primary-foreground">
                {t("page.eyebrow")}
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                  {t("page.title")}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                  {t("empty.description")}
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {(["behavior", "knowledge", "preview"] as const).map((key) => (
                <div
                  className="rounded-[1.5rem] border border-border/60 bg-white/70 p-5 shadow-sm backdrop-blur"
                  key={key}
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {t(`empty.cards.${key}.eyebrow`)}
                  </p>
                  <p className="mt-3 text-base font-semibold tracking-tight text-foreground">
                    {t(`empty.cards.${key}.title`)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t(`empty.cards.${key}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <BusinessSetupCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 xl:grid-cols-3">
        {workflowSteps.map((step, index) => (
          <div
            className="group rounded-[1.5rem] border border-border/70 bg-card/80 p-5 shadow-sm transition-colors hover:bg-card"
            key={step.key}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("workflow.step", { value: index + 1 })}
                </p>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {t(`workflow.steps.${step.key}.title`)}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t(`workflow.steps.${step.key}.description`)}
                  </p>
                </div>
              </div>
              <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-border/60 bg-background/80 text-foreground">
                <step.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="flex flex-col gap-8">
          <section className="space-y-4">
            <SectionHeading
              description={t("sections.profile.description")}
              eyebrow={t("sections.profile.eyebrow")}
              title={t("sections.profile.title")}
            />
            <BusinessProfileForm businessId={businessId} />
          </section>

          <section className="space-y-4">
            <SectionHeading
              description={t("sections.knowledge.description")}
              eyebrow={t("sections.knowledge.eyebrow")}
              title={t("sections.knowledge.title")}
            />
            <KnowledgeManager businessId={businessId} />
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <section className="space-y-4">
            <SectionHeading
              description={t("sections.snapshot.description")}
              eyebrow={t("sections.snapshot.eyebrow")}
              title={t("sections.snapshot.title")}
            />
            <BusinessSnapshotCard snapshot={snapshot} />
          </section>

          <section className="space-y-4">
            <SectionHeading
              description={t("sections.preview.description")}
              eyebrow={t("sections.preview.eyebrow")}
              title={t("sections.preview.title")}
            />
            <PreviewPanel businessId={businessId} enabled />
          </section>
        </div>
      </div>
    </div>
  );
}
