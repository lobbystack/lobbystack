"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";

import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { receptionistPath } from "@/lib/navigation-routes";
import { allServicesQueryKey, fetchAllCatalogServices } from "@/lib/catalog-services";
import { requestJson } from "@/lib/request-json";
import { useReceptionistsOverview } from "./receptionist-page";

/** Header and frame every business page in the new navigation shares. */
export function BusinessPage({ title, notice, actions, children }: { title: string; notice?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader actions={actions} title={title} />
      {notice}
      <div className="w-full"><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></div>
    </section>
  );
}

/**
 * Tells the owner, before they edit, that services or knowledge are shared:
 * "Used by all receptionists", or which receptionist skips which item.
 */
export function SharedUsageNotice({ kind }: { kind: "services" | "knowledge" }) {
  const { i18n, t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const businessId = navigation?.businessId;
  const overview = useReceptionistsOverview();
  const catalog = useQuery({ queryKey: allServicesQueryKey(businessId), enabled: Boolean(businessId && kind === "services"), queryFn: () => fetchAllCatalogServices(businessId!) });
  const services = catalog.data;
  const documents = useQuery({ queryKey: ["knowledge", businessId], enabled: Boolean(businessId && kind === "knowledge"), queryFn: () => requestJson<{ documents: Array<{ id: string; title: string }> }>(`/api/knowledge?businessId=${encodeURIComponent(businessId!)}`) });
  const snippets = useQuery({ queryKey: ["knowledge-snippets", businessId], enabled: Boolean(businessId && kind === "knowledge"), queryFn: () => requestJson<{ snippets: Array<{ id: string; title: string }> }>(`/api/knowledge/snippets?businessId=${encodeURIComponent(businessId!)}`) });
  const usage = overview.data?.usage;
  if (!usage || !navigation || navigation.receptionists.length < 2) return null;

  const names = new Map<string, string>([
    ...(services ?? []).map((service) => [service.id, service.name] as const),
    ...(documents.data?.documents ?? []).map((document) => [document.id, document.title] as const),
    ...(snippets.data?.snippets ?? []).map((snippet) => [snippet.id, snippet.title] as const),
  ]);
  const skipped = usage.receptionists.map((receptionist) => ({
    receptionist,
    items: (kind === "services"
      ? usage.serviceOptOuts.filter((row) => row.agentId === receptionist.id).map((row) => row.serviceId)
      : usage.knowledgeOptOuts.filter((row) => row.agentId === receptionist.id).map((row) => row.documentId ?? row.snippetId ?? ""))
      .map((id) => names.get(id)).filter((name): name is string => Boolean(name)),
  })).filter((entry) => entry.items.length > 0);
  const list = (values: string[]) => new Intl.ListFormat(i18n.resolvedLanguage ?? i18n.language, { type: "conjunction" }).format(values);
  const section = kind === "services" ? "booking" : "knowledge";

  return (
    <Alert className="rounded-xl" data-testid="shared-usage-notice">
      <Info />
      <AlertTitle>{skipped.length === 0 ? t("shared.all") : t(`shared.${kind}Title`)}</AlertTitle>
      <AlertDescription>
        <p>{t(`shared.${kind}Hint`)}</p>
        {skipped.map(({ receptionist, items }) => (
          <p key={receptionist.id}>
            <Trans components={{ link: <Link className="font-medium underline underline-offset-4" href={receptionistPath(receptionist.id, section)} /> }} i18nKey="shared.skips" t={t} values={{ name: receptionist.name, items: list(items) }} />
          </p>
        ))}
      </AlertDescription>
    </Alert>
  );
}
