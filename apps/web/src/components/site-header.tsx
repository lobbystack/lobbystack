import { useEffect, useState } from "react";
import { PanelLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SiteHeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean;
  className?: string;
  links?: Array<{
    title: string;
    href: string;
    disabled?: boolean;
  }>;
};

export function SiteHeader({
  className,
  fixed,
  links = [],
  ...props
}: SiteHeaderProps) {
  const { toggleSidebar } = useSidebar();
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
        <Button
          aria-label="Toggle sidebar"
          className="md:hidden"
          onClick={() => {
            toggleSidebar();
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <PanelLeftIcon />
        </Button>
      </div>
    </header>
  );
}
