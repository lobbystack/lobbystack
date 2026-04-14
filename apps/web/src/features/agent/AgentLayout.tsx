import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { PageHeader } from "@/components/page-header";
import { AddKnowledgeSheet } from "./AddKnowledgeSheet";
import { UploadKnowledgeDocumentSheet } from "./UploadKnowledgeDocumentSheet";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getAgentSectionFromPathname } from "./sections";

type AgentLayoutProps = {
  businessId?: Id<"businesses">;
};

export function AgentLayout({ businessId }: AgentLayoutProps) {
  const { t } = useTranslation(["agent", "settings"]);
  const location = useLocation();
  const section = getAgentSectionFromPathname(location.pathname);
  const isBasicSettingsRoute =
    location.pathname === "/agent/basic-settings" || location.pathname === "/agent";
  const isKnowledgeRoute = section === "knowledge" || section === "services" || section === "rules";

  if (!businessId) {
    return <BusinessSetupCard />;
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
  } else if (section === "integrations") {
    header = {
      title: t("settings:sections.integrations"),
      description: t("settings:layout.integrationsDescription"),
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <div className={isBasicSettingsRoute ? "mx-auto flex w-full max-w-3xl flex-col gap-6" : "w-full"}>
        <PageHeader
          actions={
            !isBasicSettingsRoute && isKnowledgeRoute ? (
              <>
                {section === "knowledge" ? (
                  <UploadKnowledgeDocumentSheet businessId={businessId} section={section} />
                ) : null}
                <AddKnowledgeSheet businessId={businessId} section={section} />
              </>
            ) : undefined
          }
          description={header.description}
          title={header.title}
        />
        <div className="w-full">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
