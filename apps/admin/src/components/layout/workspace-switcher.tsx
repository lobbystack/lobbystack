"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { SidebarTeamSkeleton } from "@/components/loading-skeletons";
import { recordPendingWorkspaceSwitch } from "@/lib/workspace-analytics";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { SidebarMenu, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
type Business = { businessId: string; name: string; active: boolean };
async function getBusinesses(): Promise<{ businesses: Business[] }> {
  const response = await fetch("/api/businesses", { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load workspaces.");
  return await response.json() as { businesses: Business[] };
}
export function WorkspaceSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation("nav");
  const { isMobile } = useSidebar();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: getBusinesses });
  const [switching, setSwitching] = useState(false);
  const active = businesses.data?.businesses.find((business) => business.active) ?? businesses.data?.businesses[0];

  async function selectBusiness(businessId: string) {
    if (businessId === active?.businessId) return;
    setSwitching(true);
    try {
      const response = await fetch("/api/businesses/switch", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!response.ok) throw new Error("Workspace switch failed.");
      recordPendingWorkspaceSwitch(businessId, active?.businessId ?? businessId);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "businesses" });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  if (businesses.isLoading) return <SidebarMenu className="group-data-[collapsible=icon]:hidden"><SidebarMenuItem><SidebarTeamSkeleton /></SidebarMenuItem></SidebarMenu>;

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:hidden">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Item
                className="w-full gap-2 rounded-lg px-2 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground"
                render={<button disabled={switching} type="button" />}
                size="xs"
              />
            }
          >
            <ItemMedia variant="icon"><WorkspaceInitial name={active?.name} /></ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="ph-mask w-full truncate text-left font-medium">
                {active?.name ?? t("sidebar.businessSlugFallback")}
              </ItemTitle>
            </ItemContent>
            <ItemActions><ChevronsUpDown className="size-4 text-muted-foreground" /></ItemActions>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56 rounded-xl" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              {(businesses.data?.businesses ?? []).map((business) => (
                <DropdownMenuItem className="gap-2.5 px-3 py-2" key={business.businessId} onClick={() => void selectBusiness(business.businessId)}>
                  {business.businessId === active?.businessId ? <Check className="size-4" /> : <span className="size-4" />}
                  <span className="ph-mask truncate">{business.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2.5 px-3 py-2" render={<Link href="/onboarding/business?create=true" />}>
              <Plus className="size-4" />
              {t("sidebar.createBusiness")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** The workspace's first letter, so the switcher reads as an account row. */
function WorkspaceInitial({ name }: { name: string | undefined }) {
  const initial = name?.trim().charAt(0).toUpperCase();
  return (
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
      {initial || "?"}
    </span>
  );
}
