import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { ThemeSwitch } from "@/components/theme-switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type SiteHeaderProps = {
  onSignOut: () => void;
};

export function SiteHeader({ onSignOut }: SiteHeaderProps) {
  const { t } = useTranslation("nav");

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="flex h-full items-center gap-3 px-4 sm:gap-4 md:px-6">
        <SidebarTrigger className="max-md:scale-125" variant="outline" />
        <Separator className="h-6" orientation="vertical" />
        <div className="relative hidden w-full max-w-sm items-center md:flex">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search.placeholder")} />
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeSwitch />
          <LanguageSwitcher />
          <ProfileDropdown onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
