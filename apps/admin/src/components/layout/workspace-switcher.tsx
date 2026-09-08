"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2Icon, Check, ChevronsUpDown, Plus } from "lucide-react";
import { SidebarTeamSkeleton } from "@/components/loading-skeletons";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
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
  const { i18n, t } = useTranslation("nav");
  const { isMobile } = useSidebar();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: getBusinesses });
  const [switching, setSwitching] = useState(false);
  const active = businesses.data?.businesses.find((business) => business.active) ?? businesses.data?.businesses[0];
  const phoneNumbers = useQuery({
    queryKey: ["phone-numbers", active?.businessId],
    queryFn: async () => {
      const response = await fetch(`/api/phone-numbers?businessId=${encodeURIComponent(active!.businessId)}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load workspace phone number.");
      return await response.json() as { phoneNumbers: Array<{ e164: string; status: string }> };
    },
    enabled: Boolean(active),
  });
  const primaryPhone = phoneNumbers.data?.phoneNumbers.find((number) => number.status === "active") ?? phoneNumbers.data?.phoneNumbers[0];

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
                className="w-full gap-2 px-3 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open=true]:bg-sidebar-accent data-[popup-open=true]:text-sidebar-accent-foreground"
                render={<button disabled={switching} type="button" />}
                size="xs"
                variant="outline"
              />
            }
          >
            <ItemMedia variant="icon"><Building2Icon /></ItemMedia>
            <ItemContent className="min-w-0 gap-0.5">
              <ItemTitle className="ph-mask line-clamp-2 w-full text-left font-medium leading-tight">
                {active?.name ?? t("sidebar.businessSlugFallback")}
              </ItemTitle>
              <ItemDescription className={phoneNumbers.isLoading ? "text-xs" : "ph-mask text-xs tabular-nums"}>{phoneNumbers.isLoading ? t("sidebar.loadingPhone") : primaryPhone ? formatPhoneNumberDisplay(primaryPhone.e164, i18n.language) : t("sidebar.noBusinessPhone")}</ItemDescription>
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

