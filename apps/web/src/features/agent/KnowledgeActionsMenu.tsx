import { useState } from "react";
import { ChevronDown, FileText, Globe, Plus, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddKnowledgeSheet } from "./AddKnowledgeSheet";
import { ImportWebsiteKnowledgeSheet } from "./ImportWebsiteKnowledgeSheet";
import { UploadKnowledgeDocumentSheet } from "./UploadKnowledgeDocumentSheet";

export function KnowledgeActionsMenu({
  businessId,
}: {
  businessId: Id<"businesses">;
}) {
  const { t } = useTranslation("agent");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isWebsiteOpen, setIsWebsiteOpen] = useState(false);
  const [isTextOpen, setIsTextOpen] = useState(false);

  return (
    <>
      <UploadKnowledgeDocumentSheet
        businessId={businessId}
        onOpenChange={setIsUploadOpen}
        open={isUploadOpen}
        section="knowledge"
      />
      <ImportWebsiteKnowledgeSheet
        businessId={businessId}
        onOpenChange={setIsWebsiteOpen}
        open={isWebsiteOpen}
      />
      <AddKnowledgeSheet
        businessId={businessId}
        onOpenChange={setIsTextOpen}
        open={isTextOpen}
        section="knowledge"
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button">
              <Plus data-icon="inline-start" />
              {t("sections.knowledge.addKnowledge")}
              <ChevronDown data-icon="inline-end" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-44 w-auto p-1" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setIsUploadOpen(true);
              }}
            >
              <Upload />
              <span>{t("sections.knowledge.addKnowledgeOptions.upload")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setIsWebsiteOpen(true);
              }}
            >
              <Globe />
              <span>{t("sections.knowledge.addKnowledgeOptions.website")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setIsTextOpen(true);
              }}
            >
              <FileText />
              <span>{t("sections.knowledge.addKnowledgeOptions.text")}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
