import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SetupGuideStepId = "website" | "sources" | "calendar" | "services" | "rules";

type SetupGuideStepProgress = {
  id: SetupGuideStepId;
  completed: boolean;
};

type SetupGuideProgress = {
  steps: Array<SetupGuideStepProgress>;
  completedSteps: number;
  totalSteps: number;
  allCompleted: boolean;
};

export function SetupGuideCard({
  businessId,
}: {
  businessId: Id<"businesses">;
}) {
  const { t } = useTranslation("nav");
  const navigate = useNavigate();
  const progress = useQuery(api.businesses.setupGuide.getProgress, {
    businessId,
  }) as SetupGuideProgress | undefined;

  if (!progress || progress.allCompleted) {
    return null;
  }

  return (
    <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
      <Button
        aria-label={t("sidebar.setupGuide.open")}
        className="h-auto w-full justify-start rounded-xl bg-foreground px-4 py-3 text-background hover:!bg-foreground hover:!text-background focus-visible:!bg-foreground focus-visible:!text-background active:!bg-foreground active:!text-background"
        onClick={() => navigate("/setup-guide")}
        type="button"
        variant="ghost"
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-2 text-left">
          <span className="flex w-full items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {t("sidebar.setupGuide.title")}
            </span>
            <ChevronRight data-icon="inline-end" />
          </span>
          <span className="text-xs text-background/70">
            {t("sidebar.setupGuide.progress", {
              completed: progress.completedSteps,
              total: progress.totalSteps,
            })}
          </span>
          <span
            aria-hidden="true"
            className="grid w-full grid-cols-5 gap-1"
          >
            {progress.steps.map((step) => (
              <span
                className={cn(
                  "h-1 rounded-full bg-background/20",
                  step.completed && "bg-background",
                )}
                key={step.id}
              />
            ))}
          </span>
        </span>
      </Button>
    </div>
  );
}
