import { useEffect, useState, type RefObject } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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
      </div>
    </header>
  );
}
