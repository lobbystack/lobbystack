import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { AddKnowledgeSheet } from "./AddKnowledgeSheet";
import { UploadKnowledgeDocumentSheet } from "./UploadKnowledgeDocumentSheet";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getAgentSectionFromPathname } from "./sections";

type AgentLayoutProps = {
  businessId?: Id<"businesses">;
};

export function AgentLayout({ businessId }: AgentLayoutProps) {
  const { t } = useTranslation("agent");
  const location = useLocation();
  const section = getAgentSectionFromPathname(location.pathname);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  let header = {
    title: t("page.title"),
    description: t("page.description"),
  };

  if (location.pathname === "/agent/basic-settings" || location.pathname === "/agent") {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 py-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">{header.title}</h1>
          {section === "knowledge" && (
            <div className="flex items-center gap-2">
              <UploadKnowledgeDocumentSheet businessId={businessId} section={section} />
              <AddKnowledgeSheet businessId={businessId} section={section} />
            </div>
          )}
          {section === "services" && <AddKnowledgeSheet businessId={businessId} section={section} />}
          {section === "rules" && <AddKnowledgeSheet businessId={businessId} section={section} />}
        </div>
        <p className="text-sm text-muted-foreground">{header.description}</p>
      </div>
      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
}
