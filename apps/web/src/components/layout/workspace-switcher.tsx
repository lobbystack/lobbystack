import { useQuery } from "convex/react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { SidebarTeamSkeleton } from "@/components/loading-skeletons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { useObservedMutation } from "@/lib/observed-convex";

type WorkspaceSwitcherProps = {
  activeBusinessId?: Id<"businesses">;
  businessName?: string;
  isLoading?: boolean;
};

export function WorkspaceSwitcher({
  activeBusinessId,
  businessName,
  isLoading = false,
}: WorkspaceSwitcherProps) {
  const { i18n, t } = useTranslation("nav");
  const { isMobile } = useSidebar();
  const businesses = useQuery(api.businesses.admin.listForCurrentUser, {});
  const primaryPhoneNumber = useQuery(
    api.businesses.catalog.getPrimaryPhoneNumber,
    activeBusinessId ? { businessId: activeBusinessId } : "skip",
  );
  const setActiveBusiness = useObservedMutation(api.businesses.admin.setActiveBusiness);
  const isWorkspaceListLoading = businesses === undefined;
  const showLoading = isLoading || isWorkspaceListLoading;
  const displayName =
    businessName ??
    businesses?.find((entry) => entry.business._id === activeBusinessId)?.business.name ??
    t("sidebar.businessSlugFallback");
  const phoneDisplay =
    primaryPhoneNumber === undefined
      ? null
      : primaryPhoneNumber
        ? formatPhoneNumberDisplay(
            primaryPhoneNumber.e164,
            i18n.resolvedLanguage ?? i18n.language,
          )
        : t("sidebar.noBusinessPhone");

  async function handleSelectBusiness(businessId: Id<"businesses">): Promise<void> {
    if (businessId === activeBusinessId) {
      return;
    }

    await setActiveBusiness({ businessId });
  }

  if (showLoading) {
    return (
      <SidebarMenu className="group-data-[collapsible=icon]:hidden">
        <SidebarMenuItem>
          <SidebarTeamSkeleton />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:hidden">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Item
                className="w-full gap-2 px-3 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground"
                render={<button type="button" />}
                size="xs"
                variant="outline"
              />
            }
          >
            <ItemMedia variant="icon">
              <Building2 />
            </ItemMedia>
            <ItemContent className="min-w-0 gap-0.5">
              <ItemTitle className="font-medium leading-tight">{displayName}</ItemTitle>
              {phoneDisplay ? (
                <ItemDescription className="text-xs tabular-nums">
                  {phoneDisplay}
                </ItemDescription>
              ) : (
                <ItemDescription className="text-xs">
                  {t("sidebar.loadingPhone")}
                </ItemDescription>
              )}
            </ItemContent>
            <ItemActions>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </ItemActions>
          </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-56 rounded-xl"
          side={isMobile ? "bottom" : "right"}
          sideOffset={4}
        >
          <DropdownMenuGroup>
            {(businesses ?? []).map((entry) => {
              const isActive = entry.business._id === activeBusinessId;

              return (
                <DropdownMenuItem
                  className="gap-2.5 px-3 py-2"
                  key={entry.business._id}
                  onClick={() => void handleSelectBusiness(entry.business._id)}
                >
                  {isActive ? <Check className="size-4" /> : <span className="size-4" />}
                  <span className="truncate">{entry.business.name}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2.5 px-3 py-2"
            render={<Link to="/onboarding/business?create=true" />}
          >
            <Plus className="size-4" />
            {t("sidebar.createBusiness")}
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
