import { LanguageSwitcher } from "@/components/language-switcher";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

type SiteHeaderProps = {
  title: string;
  description: string;
};

export function SiteHeader({ title, description }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="flex w-full items-center gap-4 px-4 py-3 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator className="mx-1 h-4 data-vertical:self-auto" orientation="vertical" />
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
          <p className="truncate text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="ml-auto">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
