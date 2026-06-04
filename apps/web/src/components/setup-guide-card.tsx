import { useQuery } from "convex/react";
import { Check, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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

const stepTargets: Record<SetupGuideStepId, string> = {
  website: "/agent/knowledge?setup=website",
  sources: "/agent/knowledge?setup=upload",
  calendar: "/integrations?setup=calendar",
  services: "/agent/services?setup=service",
  rules: "/agent/rules?setup=rule",
};

const stepOrder: Array<SetupGuideStepId> = [
  "website",
  "sources",
  "calendar",
  "services",
  "rules",
];

function getOrderedSteps(progress: SetupGuideProgress): Array<SetupGuideStepProgress> {
  const byId = new Map(progress.steps.map((step) => [step.id, step]));
  return stepOrder.map((id) => byId.get(id) ?? { id, completed: false });
}

export function SetupGuideCard({
  businessId,
}: {
  businessId: Id<"businesses">;
}) {
  const { t } = useTranslation("nav");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const progress = useQuery(api.businesses.setupGuide.getProgress, {
    businessId,
  }) as SetupGuideProgress | undefined;
  const steps = useMemo(
    () => (progress ? getOrderedSteps(progress) : []),
    [progress],
  );

  if (!progress || progress.allCompleted) {
    return null;
  }

  function handleStepClick(stepId: SetupGuideStepId): void {
    setOpen(false);
    navigate(stepTargets[stepId]);
  }

  return (
    <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              aria-label={t("sidebar.setupGuide.open")}
              className="h-auto w-full justify-start rounded-xl bg-foreground px-4 py-3 text-background shadow-sm hover:bg-foreground/90 hover:text-background"
              type="button"
              variant="ghost"
            />
          }
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
              {steps.map((step) => (
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
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-3"
          side="right"
          sideOffset={12}
        >
          <PopoverHeader className="gap-1 px-1">
            <PopoverTitle>{t("sidebar.setupGuide.title")}</PopoverTitle>
            <PopoverDescription>
              {t("sidebar.setupGuide.description", {
                completed: progress.completedSteps,
                total: progress.totalSteps,
              })}
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex flex-col gap-1">
            {steps.map((step) => (
              <Button
                className="h-auto justify-start gap-3 rounded-xl px-3 py-2.5 text-left"
                key={step.id}
                onClick={() => handleStepClick(step.id)}
                type="button"
                variant="ghost"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                    step.completed
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {step.completed ? <Check /> : stepOrder.indexOf(step.id) + 1}
                </span>
                <span className="min-w-0 flex-1 whitespace-normal">
                  {t(`sidebar.setupGuide.steps.${step.id}`)}
                </span>
                <ChevronRight data-icon="inline-end" />
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
