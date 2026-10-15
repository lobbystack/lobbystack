import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getTestCallStarter, startTestCall, subscribeTestCallStarter } from "@/lib/test-call-launcher";
import { cn } from "@/lib/utils";

/** Where the dashboard's utility bar renders on phones. */
export const MOBILE_UTILITY_SLOT_ID = "mobile-utility-slot";

/** The test call button on phones. The dashboard's call widget runs the call; this only starts it. */
function MobileTestCallButton() {
  const { t } = useTranslation("common");
  const ready = useSyncExternalStore(subscribeTestCallStarter, () => getTestCallStarter() !== null, () => false);
  if (!ready) return null;
  return (
    <Button className="md:hidden" onClick={() => startTestCall()} size="sm" type="button" variant="outline">
      <Phone />
      {t("testCall.trigger")}
    </Button>
  );
}

type SiteHeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean;
  className?: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
};

export function SiteHeader({
  className,
  fixed,
  scrollContainerRef,
  ...props
}: SiteHeaderProps) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current;
    const onScroll = () => {
      setOffset(
        scrollContainer
          ? scrollContainer.scrollTop
          : document.body.scrollTop || document.documentElement.scrollTop,
      );
    };

    onScroll();
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", onScroll, { passive: true });
      return () => scrollContainer.removeEventListener("scroll", onScroll);
    }

    document.addEventListener("scroll", onScroll, { passive: true });
    return () => document.removeEventListener("scroll", onScroll);
  }, [scrollContainerRef]);

  return (
    <header
      className={cn(
        "z-50 h-16 md:hidden",
        fixed && "header-fixed peer/header sticky top-0 w-[inherit]",
        offset > 10 && fixed ? "shadow" : "shadow-none",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "relative flex h-full items-center gap-3 p-4 sm:gap-4",
          offset > 10 &&
            fixed &&
            "after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg",
        )}
      >
        <SidebarTrigger className="md:hidden" size="icon" type="button" variant="outline" />
        <div className="ml-auto flex items-center gap-2">
          <MobileTestCallButton />
          <div className="flex items-center gap-0.5" id={MOBILE_UTILITY_SLOT_ID} />
        </div>
      </div>
    </header>
  );
}
