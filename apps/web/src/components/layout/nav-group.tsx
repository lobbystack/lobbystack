import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import type {
  NavCollapsibleItem,
  NavGroup as NavGroupProps,
  NavItem,
  NavLinkItem,
} from "@/components/layout/sidebar-types";

export function NavGroup({ title, items }: NavGroupProps) {
  const { state, isMobile } = useSidebar();
  const location = useLocation();
  const href = location.pathname;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const key = `${item.title}-${"url" in item ? item.url : item.items[0]?.url ?? title}`;

          if (isNavLinkItem(item)) {
            return <SidebarMenuLink href={href} item={item} key={key} />;
          }

          if (state === "collapsed" && !isMobile) {
            return <SidebarMenuCollapsedDropdown href={href} item={item} key={key} />;
          }

          return <SidebarMenuCollapsible href={href} item={item} key={key} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function isNavLinkItem(item: NavItem): item is NavLinkItem {
  return "url" in item;
}

function NavBadge({ children }: { children: ReactNode }) {
  return <Badge className="rounded-full px-1 py-0 text-xs">{children}</Badge>;
}

function SidebarMenuLink({ item, href }: { item: NavLinkItem; href: string }) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={checkIsActive(href, item)}
        render={<NavLink to={item.url} />}
        tooltip={item.title}
        onClick={() => setOpenMobile(false)}
      >
        {item.icon ? <item.icon /> : null}
        <span>{item.title}</span>
        {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarMenuCollapsible({
  item,
  href,
}: {
  item: NavCollapsibleItem;
  href: string;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <Collapsible
      asChild
      className="group/collapsible"
      defaultOpen={checkIsActive(href, item, true)}
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            {item.icon ? <item.icon /> : null}
            <span>{item.title}</span>
            {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
            <ChevronRight className="ms-auto transition-transform duration-200 group-data-[open]/collapsible:rotate-90 rtl:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="CollapsibleContent">
          <SidebarMenuSub>
            {item.items.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  isActive={checkIsActive(href, subItem)}
                  onClick={() => setOpenMobile(false)}
                  render={<NavLink to={subItem.url} />}
                >
                  {subItem.icon ? <subItem.icon /> : null}
                  <span>{subItem.title}</span>
                  {subItem.badge ? <NavBadge>{subItem.badge}</NavBadge> : null}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SidebarMenuCollapsedDropdown({
  item,
  href,
}: {
  item: NavCollapsibleItem;
  href: string;
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              isActive={checkIsActive(href, item)}
              tooltip={item.title}
            />
          }
        >
          {item.icon ? <item.icon /> : null}
          <span>{item.title}</span>
          {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
          <ChevronRight className="ms-auto transition-transform duration-200" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" sideOffset={4}>
          <div className="px-3 py-3 text-xs text-muted-foreground">
            {item.title} {item.badge ? `(${item.badge})` : ""}
          </div>
          <DropdownMenuSeparator />
          {item.items.map((sub) => (
            <DropdownMenuItem
              className={checkIsActive(href, sub) ? "bg-secondary" : ""}
              key={`${sub.title}-${sub.url}`}
              render={<NavLink to={sub.url} />}
            >
              {sub.icon ? <sub.icon /> : null}
              <span className="max-w-52 text-wrap">{sub.title}</span>
              {sub.badge ? <span className="ms-auto text-xs">{sub.badge}</span> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  return (
    href === ("url" in item ? item.url : "") ||
    href.split("?")[0] === ("url" in item ? item.url : "") ||
    ("items" in item && item.items.some((subItem) => subItem.url === href)) ||
    (mainNav &&
      "items" in item &&
      href.split("/")[1] !== "" &&
      href.split("/")[1] === item.items[0]?.url.split("/")[1])
  );
}
