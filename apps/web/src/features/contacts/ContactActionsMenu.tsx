import { MoreHorizontal, Trash2, UserCheck, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ContactActionsMenuProps = {
  blocking?: boolean;
  deleting?: boolean;
  isBlocked: boolean;
  onDelete?: () => void;
  onToggleBlock: () => void;
};

export function ContactActionsMenu({
  blocking = false,
  deleting = false,
  isBlocked,
  onDelete,
  onToggleBlock,
}: ContactActionsMenuProps) {
  const { t } = useTranslation("contacts");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("table.actions.moreOptions")}
            disabled={deleting || blocking}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            size="icon-sm"
            title={t("table.actions.moreOptions")}
            type="button"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="min-w-[9rem] w-auto p-1"
        onClick={(event) => {
          event.stopPropagation();
        }}
        side="bottom"
        sideOffset={8}
      >
        {isBlocked ? (
          <DropdownMenuItem
            className="gap-2.5 px-3 py-2"
            onClick={(event) => {
              event.stopPropagation();
              onToggleBlock();
            }}
          >
            <UserCheck />
            <span>{t("table.actions.unblockContact")}</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="gap-2.5 px-3 py-2"
            onClick={(event) => {
              event.stopPropagation();
              onToggleBlock();
            }}
            variant="destructive"
          >
            <UserX />
            <span>{t("table.actions.blockContact")}</span>
          </DropdownMenuItem>
        )}
        {onDelete ? (
          <DropdownMenuItem
            className="gap-2.5 px-3 py-2"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            variant="destructive"
          >
            <Trash2 />
            <span>{t("table.actions.deleteContact")}</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
