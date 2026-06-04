import { useQuery } from "convex/react";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PageHeader } from "@/components/page-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { useObservedMutation } from "@/lib/observed-convex";

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

function getNextStepId(stepId: SetupGuideStepId): SetupGuideStepId | null {
  const index = stepOrder.indexOf(stepId);
  const nextStep = stepOrder[index + 1];

  return nextStep ?? null;
}

function getOrderedSteps(progress: SetupGuideProgress): Array<SetupGuideStepProgress> {
  const byId = new Map(progress.steps.map((step) => [step.id, step]));
  return stepOrder.map((id) => byId.get(id) ?? { id, completed: false });
}

function ProgressRing({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(completed / total, 1) : 0;
  const offset = circumference * (1 - progress);

  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0 -rotate-90"
      viewBox="0 0 20 20"
    >
      <circle
        className="stroke-border"
        cx="10"
        cy="10"
        fill="none"
        r={radius}
        strokeWidth="1.75"
      />
      <circle
        className="stroke-foreground transition-[stroke-dashoffset] duration-300 ease-out"
        cx="10"
        cy="10"
        fill="none"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function StepMarker({
  completed,
}: {
  completed: boolean;
}) {
  if (completed) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/70 text-background">
        <Check className="size-4" />
      </span>
    );
  }

  const radius = 10.5;
  const circumference = 2 * Math.PI * radius;
  const segmentLength = circumference / 6;
  const dashLength = segmentLength * 0.62;
  const gapLength = segmentLength - dashLength;

  return (
    <span className="relative flex size-6 shrink-0 items-center justify-center bg-background">
      <svg aria-hidden="true" className="absolute inset-0 size-6" viewBox="0 0 24 24">
        <circle
          className="stroke-foreground"
          cx="12"
          cy="12"
          fill="none"
          r={radius}
          strokeDasharray={`${dashLength} ${gapLength}`}
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
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
  const skipStep = useObservedMutation(api.businesses.setupGuide.skipStep);
  const steps = useMemo(
    () => (progress ? getOrderedSteps(progress) : []),
    [progress],
  );
  const activeStepId =
    steps.find((step) => !step.completed)?.id ?? steps[0]?.id ?? "website";
  const [openStepId, setOpenStepId] = useState<SetupGuideStepId>(activeStepId);
  const [skippingStepId, setSkippingStepId] = useState<SetupGuideStepId | null>(null);

  useEffect(() => {
    setOpenStepId(activeStepId);
  }, [activeStepId]);

  async function handleSkipStep(stepId: SetupGuideStepId) {
    setSkippingStepId(stepId);

    try {
      await skipStep({ businessId, stepId });

      const nextStepId = getNextStepId(stepId);
      if (nextStepId) {
        setOpenStepId(nextStepId);
        return;
      }

      navigate("/");
    } finally {
      setSkippingStepId(null);
    }
  }

  if (progress?.allCompleted) {
    return <Navigate replace to="/" />;
  }

  if (!progress) {
    return (
      <section className="flex flex-1 flex-col gap-6">
        <PageHeader title={t("sidebar.setupGuide.title")} />
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-6 w-72" />
            <Button onClick={() => navigate("/")} type="button" variant="outline">
              {t("sidebar.setupGuide.skip")}
            </Button>
          </div>
          <Surface className="p-3">
            {stepOrder.map((stepId) => (
              <Skeleton className="mb-2 h-16 rounded-xl last:mb-0" key={stepId} />
            ))}
          </Surface>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader title={t("sidebar.setupGuide.title")} />

      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-muted-foreground">
            <ProgressRing completed={progress.completedSteps} total={progress.totalSteps} />
            <p className="text-base">
              {t("sidebar.setupGuide.description", {
                completed: progress.completedSteps,
                total: progress.totalSteps,
              })}
            </p>
          </div>
          <Button onClick={() => navigate("/")} type="button" variant="outline">
            {t("sidebar.setupGuide.skip")}
          </Button>
        </div>

        <Surface>
          <Accordion
            onValueChange={(value) => {
              const nextValue = value[0];
              const nextStep = steps.find((step) => step.id === nextValue);

              if (nextStep && !nextStep.completed) {
                setOpenStepId(nextStep.id);
              }
            }}
            value={[openStepId]}
          >
            {steps.map((step) => (
              <AccordionItem key={step.id} value={step.id}>
                <AccordionTrigger className="min-h-16 px-6">
                  <span className="flex min-w-0 items-center gap-4">
                    <StepMarker completed={step.completed} />
                    <span
                      className={
                        step.completed
                          ? "truncate text-base text-muted-foreground line-through decoration-muted-foreground/70"
                          : "truncate text-base"
                      }
                    >
                      {t(`sidebar.setupGuide.steps.${step.id}`)}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-6">
                  <div className="flex gap-4">
                    <span aria-hidden="true" className="size-6 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-4">
                      <p className="max-w-lg text-base leading-6 text-muted-foreground">
                        {t(`sidebar.setupGuide.stepDescriptions.${step.id}`)}
                      </p>
                      <div className="flex items-center justify-between gap-4">
                        <Button
                          onClick={() => navigate(stepTargets[step.id])}
                          type="button"
                        >
                          {t(`sidebar.setupGuide.stepActions.${step.id}`)}
                        </Button>
                        <Button
                          className="h-auto px-0 underline underline-offset-4"
                          disabled={skippingStepId === step.id}
                          onClick={() => void handleSkipStep(step.id)}
                          type="button"
                          variant="link"
                        >
                          {t("sidebar.setupGuide.skipStep")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Surface>
      </div>
    </section>
  );
}
