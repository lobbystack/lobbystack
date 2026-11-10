"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Globe, LoaderCircle, MessageCircle, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { OnboardingGoal } from "@lobbystack/domain";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { OnboardingOptionsSkeleton } from "@/components/loading-skeletons";
import { useTelemetry } from "@/components/product-analytics";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useInstagramStatus } from "@/hooks/use-instagram-status";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";

const options: Array<{ key: OnboardingGoal; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { key: "answer_calls", Icon: Phone },
  { key: "book_appointments", Icon: CalendarCheck },
  { key: "answer_website_visitors", Icon: Globe },
  { key: "answer_instagram_messages", Icon: MessageCircle },
];

export function OnboardingGoalSurface() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { business } = useActiveBusiness();
  const instagram = useInstagramStatus(business?.businessId);
  const [picked, setPicked] = useState<OnboardingGoal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = picked ?? business?.onboardingGoal ?? null;
  // A server without a Meta app can't connect Instagram, so it doesn't offer it.
  const offered = options.filter(({ key }) => key !== "answer_instagram_messages" || instagram.data?.configured !== false);
  const finish = useMutation({
    mutationFn: (goal: OnboardingGoal | null) => requestJson(`/api/onboarding/goal?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ goal }) }),
    onSuccess: async (_result, goal) => {
      if (business && goal) telemetry.track("web.onboarding.goal_submitted", { businessId: business.businessId, goal });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.push(business?.onboardingStage === "complete" ? "/" : "/onboarding/attribution");
    },
    meta: { inlineError: true },
  });

  async function submit(goal: OnboardingGoal | null) {
    setError(null);
    try {
      await finish.mutateAsync(goal);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("goal.submitFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {business && instagram.isPending ? (
        <OnboardingOptionsSkeleton gridClassName="grid gap-3 sm:grid-cols-2" itemClassName="h-20" labels={options.map(({ key }) => t(`goal.options.${key}`))} />
      ) : (
      <div className="grid gap-3 sm:grid-cols-2">
        {offered.map(({ key, Icon }) => {
          const active = selected === key;
          return <button aria-pressed={active} className={cn("flex h-20 items-center gap-3 rounded-xl border px-4 text-left text-sm font-medium transition-colors", active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:border-foreground/30")} key={key} onClick={() => setPicked(key)} type="button"><Icon aria-hidden="true" className={cn("size-4 shrink-0", active ? "text-background" : "text-muted-foreground")} /><span className="min-w-0 whitespace-normal break-words leading-snug">{t(`goal.options.${key}`)}</span></button>;
        })}
      </div>
      )}
      {error ? <FieldError>{error}</FieldError> : null}
      <Button className="h-11 w-full" disabled={!business || selected === null || finish.isPending} onClick={() => void submit(selected)} type="button">{finish.isPending ? <><LoaderCircle className="size-4 animate-spin" />{t("goal.saving")}</> : t("goal.continue")}</Button>
      <button className="mx-auto text-sm text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={!business || finish.isPending} onClick={() => void submit(null)} type="button">{t("goal.skip")}</button>
    </div>
  );
}
