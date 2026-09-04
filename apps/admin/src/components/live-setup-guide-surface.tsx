"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/page-header";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";

type StepId = "website" | "sources" | "calendar" | "services" | "rules";
type Business = { businessId: string; active: boolean };
type Step = { id: StepId; name: string; description: string; status: string };
const order: StepId[] = ["website", "sources", "calendar", "services", "rules"];
const targets: Record<StepId, string> = { website: "/agent/knowledge?setup=website", sources: "/agent/knowledge?setup=upload", calendar: "/integrations?setup=calendar", services: "/agent/services?setup=service", rules: "/agent/rules?setup=rule" };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load setup status.");
  return await response.json() as T;
}

export function LiveSetupGuideSurface() {
  const { t } = useTranslation("nav");
  const router = useRouter();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const setup = useQuery({ queryKey: ["setup", business?.businessId], queryFn: () => getJson<{ steps: Step[] }>("/api/setup"), enabled: Boolean(business) });
  const steps = useMemo(() => order.map((id) => setup.data?.steps.find((step) => step.id === id) ?? { id, name: id, description: "", status: "needs setup" }), [setup.data?.steps]);
  const active = steps.find((step) => step.status !== "complete")?.id ?? "website";
  const [openStep, setOpenStep] = useState<StepId>(active);
  useEffect(() => setOpenStep(active), [active]);
  const completed = steps.filter((step) => step.status === "complete").length;

  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader title={t("sidebar.setupGuide.title")} />
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {setup.isLoading ? <Skeleton className="h-6 w-72" /> : <div className="flex items-center gap-3 text-muted-foreground"><ProgressRing completed={completed} total={steps.length} /><p className="text-base">{t("sidebar.setupGuide.description", { completed, total: steps.length })}</p></div>}
          <Button onClick={() => router.push("/")} type="button" variant="outline">{t("sidebar.setupGuide.skip")}</Button>
        </div>
        <Surface>
          {setup.isLoading ? order.map((id) => <Skeleton className="m-3 h-16 rounded-xl" key={id} />) : (
            <Accordion onValueChange={(value) => { const next = value[0] as StepId | undefined; if (next && steps.find((step) => step.id === next)?.status !== "complete") setOpenStep(next); }} value={[openStep]}>
              {steps.map((step, index) => {
                const complete = step.status === "complete";
                return <AccordionItem key={step.id} value={step.id}>
                  <AccordionTrigger aria-disabled={complete || undefined} className={complete ? "min-h-16 cursor-default px-6 [&_[data-icon=inline-end]]:opacity-0" : "min-h-16 px-6"} tabIndex={complete ? -1 : undefined}><span className="flex min-w-0 items-center gap-4"><StepMarker completed={complete} /><span className={complete ? "truncate text-base text-muted-foreground line-through decoration-muted-foreground/70" : "truncate text-base"}>{t(`sidebar.setupGuide.steps.${step.id}`)}</span></span></AccordionTrigger>
                  <AccordionContent className="px-6"><div className="flex gap-4"><span className="size-6 shrink-0" /><div className="flex min-w-0 flex-1 flex-col gap-4"><p className="max-w-lg text-base leading-6 text-muted-foreground">{t(`sidebar.setupGuide.stepDescriptions.${step.id}`)}</p><div className="flex items-center justify-between gap-4"><Button onClick={() => router.push(targets[step.id])}>{t(`sidebar.setupGuide.stepActions.${step.id}`)}</Button><Button className="h-auto px-0 underline underline-offset-4" onClick={() => setOpenStep(steps[index + 1]?.id ?? step.id)} variant="link">{t("sidebar.setupGuide.skipStep")}</Button></div></div></div></AccordionContent>
                </AccordionItem>;
              })}
            </Accordion>
          )}
        </Surface>
      </div>
    </section>
  );
}

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const circumference = 2 * Math.PI * 7;
  const offset = circumference * (1 - (total ? Math.min(completed / total, 1) : 0));
  return <svg aria-hidden="true" className="size-5 shrink-0 -rotate-90" viewBox="0 0 20 20"><circle className="stroke-border" cx="10" cy="10" fill="none" r="7" strokeWidth="1.75" /><circle className="stroke-foreground transition-[stroke-dashoffset] duration-300" cx="10" cy="10" fill="none" r="7" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" strokeWidth="1.75" /></svg>;
}

function StepMarker({ completed }: { completed: boolean }) {
  if (completed) return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/70 text-background"><Check className="size-4" /></span>;
  return <span className="relative flex size-6 shrink-0 items-center justify-center bg-background"><svg aria-hidden="true" className="absolute inset-0 size-6" viewBox="0 0 24 24"><circle className="stroke-foreground" cx="12" cy="12" fill="none" r="10.5" strokeDasharray="6.8 4.2" strokeLinecap="round" strokeWidth="1.5" /></svg></span>;
}
