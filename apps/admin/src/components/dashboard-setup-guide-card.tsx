"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

type Business = { businessId: string; active: boolean };
type SetupStep = { name: string; status: string };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load setup status.");
  return await response.json() as T;
}

export function DashboardSetupGuideCard() {
  const { t } = useTranslation("nav");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const setup = useQuery({
    queryKey: ["setup", business?.businessId],
    queryFn: () => getJson<{ steps: SetupStep[] }>(`/api/setup?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  if (!business || !setup.data) return null;
  const completed = setup.data.steps.filter((step) => step.status === "complete").length;
  if (completed === setup.data.steps.length) return null;

  return (
    <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
      <Button
        aria-label={t("sidebar.setupGuide.open")}
        className="h-auto w-full justify-start rounded-xl bg-foreground px-4 py-3 text-background hover:!bg-foreground hover:!text-background focus-visible:!bg-foreground focus-visible:!text-background active:!bg-foreground active:!text-background"
        render={<Link href="/setup-guide" />}
        type="button"
        variant="ghost"
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-2 text-left">
          <span className="flex w-full items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{t("sidebar.setupGuide.title")}</span>
            <ChevronRight data-icon="inline-end" />
          </span>
          <span className="text-xs text-background/70">{t("sidebar.setupGuide.progress", { completed, total: setup.data.steps.length })}</span>
          <span aria-hidden="true" className="grid w-full grid-cols-5 gap-1">
            {setup.data.steps.map((step) => <span className={cn("h-1 rounded-full bg-background/20", step.status === "complete" && "bg-background")} key={step.name} />)}
          </span>
        </span>
      </Button>
    </div>
  );
}
