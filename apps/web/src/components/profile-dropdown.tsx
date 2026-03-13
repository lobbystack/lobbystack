import { LogOut, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProfileDropdownProps = {
  onSignOut: () => void;
};

export function ProfileDropdown({ onSignOut }: ProfileDropdownProps) {
  const { t } = useTranslation(["common", "nav"]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
        {t("common:appName")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem render={<Link to="/settings" />}>
          <Settings2 data-icon="inline-start" />
          {t("nav:items.settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} variant="destructive">
          <LogOut data-icon="inline-start" />
          {t("nav:sidebar.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
