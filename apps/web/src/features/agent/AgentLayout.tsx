import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { AddKnowledgeSheet } from "./AddKnowledgeSheet";
import { UploadKnowledgeDocumentSheet } from "./UploadKnowledgeDocumentSheet";
import type { Id } from "../../../../../convex/_generated/dataModel";

type AgentLayoutProps = {
  businessId?: Id<"businesses">;
};

export function AgentLayout({ businessId }: AgentLayoutProps) {
  const { t } = useTranslation("agent");
  const location = useLocation();

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
  } else if (location.pathname === "/agent/knowledge") {
    header = {
      title: t("sections.knowledge.title"),
      description: t("sections.knowledge.description"),
    };
  } else if (location.pathname === "/agent/rules") {
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
          {(location.pathname === "/agent/knowledge" || location.pathname === "/agent/rules") && (
            <div className="flex items-center gap-2">
              <UploadKnowledgeDocumentSheet businessId={businessId} />
              <AddKnowledgeSheet businessId={businessId} />
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{header.description}</p>
      </div>
      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
}
