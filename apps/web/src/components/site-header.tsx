import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ProfileDropdown } from "@/components/profile-dropdown";
import { Search } from "@/components/search";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  onSignOut: () => void;
  className?: string;
  links?: Array<{
    title: string;
    href: string;
    disabled?: boolean;
  }>;
};

export function SiteHeader({ onSignOut, className, links = [] }: SiteHeaderProps) {
  const { t } = useTranslation("nav");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop);
    };

    document.addEventListener("scroll", onScroll, { passive: true });
    return () => document.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "z-50 h-16 header-fixed peer/header sticky top-0 w-[inherit]",
        offset > 10 ? "shadow" : "shadow-none",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex h-full items-center gap-3 p-4 sm:gap-4",
          offset > 10 &&
            "after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg",
        )}
      >
        <SidebarTrigger className="max-md:scale-125" variant="outline" />
        <Separator className="h-6" orientation="vertical" />
        <Search className="max-w-md" placeholder={t("search.placeholder")} />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <Link
            aria-label="Open theme settings"
            className={cn(buttonVariants({ variant: "ghost", size: "icon", className: "rounded-full" }))}
            to="/settings/appearance"
          >
            <Settings2 className="size-4" />
          </Link>
          <ProfileDropdown onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
