import { Skeleton } from "@/components/ui/skeleton";
import { versionedAssetUrl } from "@/lib/versioned-assets";

type TeamSwitcherProps = {
  isLoading?: boolean;
};

const BRAND_NAME = "LobbyStack";

/**
 * The brand mark alone. The wordmark is dropped so the workspace switcher can
 * sit beside it on one row.
 */
export function TeamSwitcher({ isLoading = false }: TeamSwitcherProps) {
  if (isLoading) return <Skeleton className="size-8 shrink-0 rounded-lg" />;

  return (
    <div
      aria-label={BRAND_NAME}
      className="flex aspect-square size-8 shrink-0 items-center justify-center text-sidebar-foreground"
      role="img"
    >
      <img
        alt=""
        className="size-[30px] shrink-0 object-contain dark:invert"
        src={versionedAssetUrl("/brand/logo-icon.svg")}
      />
    </div>
  );
}
