import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProfileDropdownProps = {
  onSignOut: () => void;
};

export function ProfileDropdown({ onSignOut }: ProfileDropdownProps) {
  const { t } = useTranslation(["common", "nav", "settings"]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button className="relative h-8 w-8 rounded-full" size="icon-sm" variant="ghost" />}
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback>AI</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-3 font-normal">
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-none font-medium">AI Receptionist</p>
            <p className="text-xs leading-none text-muted-foreground">operator@local</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/settings" />}>
            {t("settings:sections.business")}
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/settings/appearance" />}>
            {t("settings:sections.appearance")}
            <DropdownMenuShortcut>⌘⇧A</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/settings/integrations" />}>
            {t("settings:sections.integrations")}
            <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} variant="destructive">
          {t("nav:sidebar.signOut")}
          <DropdownMenuShortcut className="text-current">⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
