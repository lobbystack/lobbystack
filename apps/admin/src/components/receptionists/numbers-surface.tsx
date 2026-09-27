"use client";

import Link from "next/link";
import { Globe, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { ReceptionistPage, useReceptionistsOverview } from "./receptionist-page";

/** The numbers and website widget that route to this receptionist. */
export function ReceptionistNumbersSurface({ agentId }: { agentId: string }) {
  const { t } = useTranslation("receptionists");
  const overview = useReceptionistsOverview();
  const routes = (overview.data?.routes ?? []).filter((route) => route.agentId === agentId);
  const isDefault = overview.data?.receptionists.find((receptionist) => receptionist.id === agentId)?.isDefault ?? false;
  return (
    <ReceptionistPage
      actions={<Button nativeButton={false} render={<Link href="/numbers" />} variant="outline">{t("numbers.manage")}</Button>}
      agentId={agentId}
      description={t("numbers.description")}
      section="numbers"
    >
      {overview.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : (
        <div className="flex flex-col gap-4">
          <Surface className="flex flex-col">
            {routes.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{t("numbers.empty")}</p> : routes.map((route) => (
              <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" key={route.id} variant="default">
                <ItemMedia>{route.kind === "phone_number" ? <Phone className="size-4" /> : <Globe className="size-4" />}</ItemMedia>
                <ItemContent>
                  <ItemTitle className="ph-mask">{route.kind === "phone_number" ? route.label : route.label || t("numbers.widget")}</ItemTitle>
                  <ItemDescription>{route.kind === "phone_number" ? t("numbers.phoneRoute") : t("numbers.widgetRoute")}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </Surface>
          {isDefault && (overview.data?.receptionists.length ?? 0) > 1 ? <p className="text-sm text-muted-foreground">{t("numbers.defaultNote")}</p> : null}
        </div>
      )}
    </ReceptionistPage>
  );
}
