import { useQuery } from "convex/react";
import { Check, ChevronDown, ChevronRight, Circle } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

const stepOrder: Array<SetupGuideStepId> = [
  "website",
  "sources",
  "calendar",
  "services",
  "rules",
];

const stepTargets: Record<SetupGuideStepId, string> = {
  website: "/agent/knowledge?setup=website",
  sources: "/agent/knowledge?setup=upload",
  calendar: "/integrations?setup=calendar",
  services: "/agent/services?setup=service",
  rules: "/agent/rules?setup=rule",
};

function getOrderedSteps(progress: SetupGuideProgress): Array<SetupGuideStepProgress> {
  const byId = new Map(progress.steps.map((step) => [step.id, step]));
  return stepOrder.map((id) => byId.get(id) ?? { id, completed: false });
}

function StepMarker({
  completed,
  index,
}: {
  completed: boolean;
  index: number;
}) {
  if (completed) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Check />
      </span>
    );
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm text-muted-foreground">
      {index + 1}
    </span>
  );
}

export function SetupGuidePage({
  businessId,
}: {
  businessId: Id<"businesses">;
}) {
  const { t } = useTranslation("nav");
  const navigate = useNavigate();
  const progress = useQuery(api.businesses.setupGuide.getProgress, {
    businessId,
  }) as SetupGuideProgress | undefined;
  const steps = useMemo(
    () => (progress ? getOrderedSteps(progress) : []),
    [progress],
  );
  const activeStepId =
    steps.find((step) => !step.completed)?.id ?? steps[0]?.id ?? "website";

  if (progress?.allCompleted) {
    return <Navigate replace to="/" />;
  }

  if (!progress) {
    return (
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 py-10">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-6 w-72" />
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,36rem)_1fr]">
          <div className="flex flex-col gap-3 rounded-xl bg-muted/20 p-3">
            {stepOrder.map((stepId) => (
              <Skeleton className="h-20 rounded-xl" key={stepId} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="type-page-title">{t("sidebar.setupGuide.title")}</h1>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Circle className="size-4" />
          <p className="text-base">
            {t("sidebar.setupGuide.description", {
              completed: progress.completedSteps,
              total: progress.totalSteps,
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,38rem)_1fr]">
        <div className="flex flex-col gap-3 rounded-xl bg-muted/20 p-3">
          {steps.map((step, index) => {
            const isActive = step.id === activeStepId;

            return (
              <Card
                className={cn(
                  "gap-0 overflow-hidden py-0",
                  isActive ? "bg-background" : "bg-background/80",
                )}
                key={step.id}
                size="sm"
              >
                <button
                  className="flex w-full items-center gap-4 px-5 py-5 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30"
                  onClick={() => {
                    if (!isActive || step.completed) {
                      navigate(stepTargets[step.id]);
                    }
                  }}
                  type="button"
                >
                  <StepMarker completed={step.completed} index={index} />
                  <span className="min-w-0 flex-1 truncate text-base font-medium">
                    {t(`sidebar.setupGuide.steps.${step.id}`)}
                  </span>
                  {isActive && !step.completed ? (
                    <ChevronDown className="text-muted-foreground" />
                  ) : (
                    <ChevronRight className="text-muted-foreground" />
                  )}
                </button>
                {isActive && !step.completed ? (
                  <>
                    <CardHeader className="px-5 pb-0 pt-0">
                      <CardTitle className="sr-only">
                        {t(`sidebar.setupGuide.steps.${step.id}`)}
                      </CardTitle>
                      <div className="flex gap-4">
                        <span aria-hidden="true" className="size-9 shrink-0" />
                        <CardDescription className="text-base leading-6">
                          {t(`sidebar.setupGuide.stepDescriptions.${step.id}`)}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 pt-5">
                      <div className="flex gap-4">
                        <span aria-hidden="true" className="size-9 shrink-0" />
                        <Button onClick={() => navigate(stepTargets[step.id])} type="button">
                          {t(`sidebar.setupGuide.stepActions.${step.id}`)}
                        </Button>
                      </div>
                    </CardContent>
                  </>
                ) : null}
              </Card>
            );
          })}
        </div>
        <div className="hidden lg:block" aria-hidden="true" />
      </div>
    </section>
  );
}
