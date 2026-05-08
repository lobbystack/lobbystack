import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { AddKnowledgeSheet } from "./AddKnowledgeSheet";
import { KnowledgeActionsMenu } from "./KnowledgeActionsMenu";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getAgentSectionFromPathname } from "./sections";

type AgentLayoutProps = {
  businessId?: Id<"businesses">;
  canManageTenant: boolean;
};

type AgentLayoutOutletContext = {
  headerActions?: ReactNode;
};

export function AgentLayout({ businessId, canManageTenant }: AgentLayoutProps) {
  const { t } = useTranslation("agent");
  const location = useLocation();
  const section = getAgentSectionFromPathname(location.pathname);
  const isBasicSettingsRoute =
    location.pathname === "/agent/basic-settings" || location.pathname === "/agent";
  const isKnowledgeRoute = section === "knowledge" || section === "services" || section === "rules";

  if (!businessId) {
    return null;
  }

  let header = {
    title: t("page.title"),
    description: t("page.description"),
  };

  if (isBasicSettingsRoute) {
    header = {
      title: t("sections.basicSettings.title"),
      description: t("sections.basicSettings.description"),
    };
  } else if (section === "knowledge") {
    header = {
      title: t("sections.knowledge.title"),
      description: t("sections.knowledge.description"),
    };
  } else if (section === "services") {
    header = {
      title: t("sections.services.title"),
      description: t("sections.services.description"),
    };
  } else if (section === "rules") {
    header = {
      title: t("sections.rules.title"),
      description: t("sections.rules.description"),
    };
  }

  const headerActions =
    canManageTenant && !isBasicSettingsRoute && isKnowledgeRoute ? (
      <>
        {section === "knowledge" ? (
          <KnowledgeActionsMenu businessId={businessId} />
        ) : null}
        {section !== "knowledge" ? (
          <AddKnowledgeSheet businessId={businessId} section={section} />
        ) : null}
      </>
    ) : undefined;

  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader description={header.description} title={header.title} />
      <div className="w-full">
        <Outlet context={{ headerActions } satisfies AgentLayoutOutletContext} />
      </div>
    </section>
  );
}

export type { AgentLayoutOutletContext };
