import { useParams } from "next/navigation";
import { useEffect, useState, type RefObject } from "react";

import { TestCallButton } from "@/components/navigation/test-call-button";
import { cn } from "@/lib/utils";

/**
 * The page title's text, and whether its heading has scrolled under the
 * header. Before a page mounts a heading, or where the browser can't tell,
 * the title counts as hidden, so the header shows it.
 */
function usePageTitle(heading: HTMLHeadingElement | null | undefined, scrollContainer: HTMLElement | null | undefined, header: HTMLElement | null) {
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
      // The heading counts as gone once it has scrolled entirely under the header, which is only the safe area's
      // height. A heading that merely starts near the top, as the Inbox's does, keeps the bar hidden.
      const topInset = header?.offsetHeight ?? 0;
      intersections = new IntersectionObserver(([entry]) => setHeadingVisible(Boolean(entry?.isIntersecting)), { root: scrollContainer ?? null, rootMargin: `-${topInset}px 0px 0px 0px` });
      intersections.observe(heading);
    }
    return () => { mutations.disconnect(); intersections?.disconnect(); };
  }, [heading, scrollContainer, header]);
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
 * The phone top bar. It takes no room of its own: it slides in over the page
 * once the page's title heading scrolls under it, as iOS does with large
 * titles, and then names the page beside the Test call button. Until then the
 * page header holds the title and its actions. Tablets and desktops have the
 * sidebar instead.
 */
export function SiteHeader({
  className,
  fixed,
  scrollContainerRef,
  titleHeading,
  ...props
}: SiteHeaderProps) {
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const { title, showTitle } = usePageTitle(titleHeading, scrollContainer, header);
  // On an agent's pages the bar tests that agent, as the page header's button does.
  const agentId = useParams<{ agentId?: string }>()?.agentId;

  useEffect(() => {
    setScrollContainer(scrollContainerRef?.current ?? null);
  }, [scrollContainerRef]);

  return (
    <header
      className={cn(
        // Only the safe area's height, so an unscrolled page starts with its own header.
        "z-40 h-[env(safe-area-inset-top)] bg-background md:hidden",
        fixed && "header-fixed peer/header sticky top-0 w-[inherit]",
        className,
      )}
      data-slot="site-header"
      ref={setHeader}
      data-title-shown={showTitle ? "" : undefined}
      {...props}
    >
      <div
        // Hidden from everyone while the page's own title shows: the page header has the same title and actions.
        aria-hidden={showTitle ? undefined : true}
        className={cn(
          "absolute inset-x-0 top-full flex h-12 items-center gap-3 border-b bg-background/80 px-4 shadow-sm backdrop-blur-lg transition-opacity duration-150 motion-reduce:transition-none",
          showTitle ? "opacity-100" : "pointer-events-none invisible opacity-0",
        )}
        data-slot="site-header-bar"
      >
        {/* The page's heading stays the one the screen reader reads. */}
        <span aria-hidden="true" className="min-w-0 flex-1 truncate type-title" data-page-title="">{title}</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <TestCallButton {...(agentId ? { agentId } : {})} />
        </div>
      </div>
    </header>
  );
}
