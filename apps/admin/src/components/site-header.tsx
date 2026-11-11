import { cn } from "@/lib/utils";

type SiteHeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean;
  className?: string;
};

/**
 * The phone's safe area above the page. It shows nothing, so the page header
 * holds the title and its actions; it only keeps scrolled content out from
 * under the status bar. Tablets and desktops have the sidebar instead.
 */
export function SiteHeader({ className, fixed, ...props }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "z-40 h-[env(safe-area-inset-top)] bg-background md:hidden",
        fixed && "header-fixed peer/header sticky top-0 w-[inherit]",
        className,
      )}
      data-slot="site-header"
      {...props}
    />
  );
}
