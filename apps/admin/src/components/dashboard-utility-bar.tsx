"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GiftIcon } from "lucide-react";

import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { DashboardTestCallWidget } from "./dashboard-test-call-widget";
import { DashboardFeedbackWidget } from "./dashboard-feedback-widget";

type Business = { businessId: string; name: string; slug: string; active: boolean; role: string };

export function DashboardUtilityBar() {
  const { t } = useTranslation("nav");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: async () => await (await fetch("/api/businesses", { credentials: "include" })).json() as { businesses: Business[] } });
  const business = selectActiveBusiness(businesses.data?.businesses);
  if (!business) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-40 hidden md:block">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-0.5 px-6">
        <DashboardTestCallWidget className="pointer-events-auto" businessId={business.businessId} businessSlug={business.slug} />
        <span aria-hidden="true" className="ml-3 mr-1.5 h-4 w-px bg-border" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t("items.affiliate")}
                role="link"
                className="pointer-events-auto text-sidebar-foreground hover:bg-transparent hover:text-sidebar-accent-foreground"
                nativeButton={false}
                render={<Link href="/affiliate" />}
                size="icon-xs"
                variant="ghost"
              />
            }
          >
            <GiftIcon className="size-[18px] -translate-x-px" strokeWidth={1.75} />
          </TooltipTrigger>
          <TooltipContent>{t("items.affiliate")}</TooltipContent>
        </Tooltip>
        <DashboardFeedbackWidget className="pointer-events-auto" businessId={business.businessId} />
      </div>
    </div>
  );
}
