import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { openTestWindow, useTestWindowReady } from "@/lib/test-window";
import { cn } from "@/lib/utils";

/** The test window's button on phones. */
function MobileTestCallButton() {
  const { t } = useTranslation("common");
  const ready = useTestWindowReady();
  if (!ready) return null;
  return (
    <Button className="md:hidden" onClick={() => openTestWindow()} size="sm" type="button" variant="outline">
      {t("testCall.trigger")}
    </Button>
  );
}

/** The header's height on phones, which the title must scroll past before the bar shows it. */
const HEADER_HEIGHT = 48;

/**
 * The page title's text, and whether its heading has scrolled under the
 * header. Before a page mounts a heading, or where the browser can't tell,
 * the title counts as hidden, so the header shows it.
 */
function usePageTitle(heading: HTMLHeadingElement | null | undefined, scrollContainer: HTMLElement | null | undefined) {
  const [title, setTitle] = useState("");
  const [headingVisible, setHeadingVisible] = useState(false);
  useEffect(() => {
    if (!heading) { setTitle(""); setHeadingVisible(false); return; }
    const read = () => setTitle(heading.textContent?.trim() ?? "");
    read();
    // An agent's rename, or a title that loads after the page, changes the heading in place.
    const mutations = new MutationObserver(read);
    mutations.observe(heading, { characterData: true, childList: true, subtree: true });
    let intersections: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      intersections = new IntersectionObserver(([entry]) => setHeadingVisible(Boolean(entry?.isIntersecting)), { root: scrollContainer ?? null, rootMargin: `-${HEADER_HEIGHT}px 0px 0px 0px` });
      intersections.observe(heading);
    }
    return () => { mutations.disconnect(); intersections?.disconnect(); };
  }, [heading, scrollContainer]);
  return { title, showTitle: Boolean(title) && !headingVisible };
}

type SiteHeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean;
  className?: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** The page's title heading, which the header names once it scrolls out of view. */
  titleHeading?: HTMLHeadingElement | null;
};

/**
 * The phone top bar: the page's title once its heading scrolls under the bar,
 * as iOS does with large titles, and the Test call button. Tablets and
 * desktops have the sidebar instead.
 */
export function SiteHeader({
  className,
  fixed,
  scrollContainerRef,
  titleHeading,
  ...props
}: SiteHeaderProps) {
  const [offset, setOffset] = useState(0);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
  const { title, showTitle } = usePageTitle(titleHeading, scrollContainer);

  useEffect(() => {
    const container = scrollContainerRef?.current ?? null;
    setScrollContainer(container);
    const onScroll = () => {
      setOffset(
        container
          ? container.scrollTop
          : document.body.scrollTop || document.documentElement.scrollTop,
      );
    };

    onScroll();
    if (container) {
      container.addEventListener("scroll", onScroll, { passive: true });
      return () => container.removeEventListener("scroll", onScroll);
    }

    document.addEventListener("scroll", onScroll, { passive: true });
    return () => document.removeEventListener("scroll", onScroll);
  }, [scrollContainerRef]);

  return (
    <header
      className={cn(
        "z-40 pt-[env(safe-area-inset-top)] md:hidden",
        fixed && "header-fixed peer/header sticky top-0 w-[inherit]",
        offset > 10 && fixed ? "shadow" : "shadow-none",
        className,
      )}
      data-slot="site-header"
      {...props}
    >
      <div
        className={cn(
          "relative flex h-12 items-center gap-3 px-4",
          offset > 10 &&
            fixed &&
            "after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg",
        )}
      >
        {/* The page's heading stays the one the screen reader reads. */}
        <span aria-hidden="true" className={cn("min-w-0 flex-1 truncate text-sm font-medium transition-opacity duration-150 motion-reduce:transition-none", showTitle ? "opacity-100" : "opacity-0")} data-page-title="">{title}</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <MobileTestCallButton />
        </div>
      </div>
    </header>
  );
}
