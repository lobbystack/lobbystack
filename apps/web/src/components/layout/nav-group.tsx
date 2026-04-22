import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

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
import { cn } from "@/lib/utils";
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

  // Derive which collapsible should be initially open based on current path
  const collapsibleItems = useMemo(
    () => items.filter((item): item is NavCollapsibleItem => !isNavLinkItem(item)),
    [items],
  );
  const initialOpen = collapsibleItems.find((item) => checkIsActive(href, item, true));
  const [openKey, setOpenKey] = useState<string | null>(
    initialOpen ? getNavItemKey(initialOpen, title) : null,
  );

  useEffect(() => {
    const activeItem = collapsibleItems.find((item) => checkIsActive(href, item, true));
    setOpenKey(activeItem ? getNavItemKey(activeItem, title) : null);
  }, [href, title, collapsibleItems]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const key = getNavItemKey(item, title);

          if (isNavLinkItem(item)) {
            return <SidebarMenuLink href={href} item={item} key={key} />;
          }

          if (state === "collapsed" && !isMobile) {
            return <SidebarMenuCollapsedDropdown href={href} item={item} key={key} />;
          }

          return (
            <SidebarMenuCollapsible
              href={href}
              isOpen={openKey === key}
              item={item}
              key={key}
              onToggle={(open) => setOpenKey(open ? key : null)}
            />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function isNavLinkItem(item: NavItem): item is NavLinkItem {
  return "url" in item;
}

function getNavItemKey(item: NavItem, fallback: string): string {
  if (isNavLinkItem(item)) {
    return `link:${item.url}`;
  }

  const itemUrls = item.items.map((subItem) => subItem.url).join("|");
  return `group:${itemUrls || fallback}`;
}

function NavBadge({ children }: { children: ReactNode }) {
  return <Badge className="rounded-full px-1 py-0 text-xs">{children}</Badge>;
}

function SidebarMenuLink({ item, href }: { item: NavLinkItem; href: string }) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const [hovered, setHovered] = useState(false);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={checkIsActive(href, item)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        tooltip={item.title}
        {...(!isMobile ? { render: <NavLink to={item.url} /> } : {})}
        onClick={() => {
          if (!isMobile) {
            return;
          }

          navigate(item.url);
          setOpenMobile(false);
        }}
      >
        {item.icon ? <item.icon hovered={hovered} /> : null}
        <span>{item.title}</span>
        {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarMenuCollapsible({
  item,
  href,
  isOpen,
  onToggle,
}: {
  item: NavCollapsibleItem;
  href: string;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const [hovered, setHovered] = useState(false);
  const [hoveredSubItemKey, setHoveredSubItemKey] = useState<string | null>(null);

  return (
    <SidebarMenuItem>
      <Collapsible className="group/collapsible" open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              tooltip={item.title}
            />
          }
        >
            {item.icon ? <item.icon hovered={hovered} /> : null}
            <span>{item.title}</span>
            {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
            <ChevronRight
              className={cn(
                "ms-auto transition-transform duration-200 rtl:rotate-180",
                isOpen && "rotate-90",
              )}
            />
        </CollapsibleTrigger>
        <CollapsibleContent className="CollapsibleContent">
          <SidebarMenuSub>
            {item.items.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  isActive={checkIsActive(href, subItem)}
                  onMouseEnter={() => setHoveredSubItemKey(getNavItemKey(subItem, item.title))}
                  onMouseLeave={() => setHoveredSubItemKey(null)}
                  {...(!isMobile ? { render: <NavLink to={subItem.url} /> } : {})}
                  onClick={() => {
                    if (!isMobile) {
                      return;
                    }

                    navigate(subItem.url);
                    setOpenMobile(false);
                  }}
                >
                  {subItem.icon ? (
                    <subItem.icon hovered={hoveredSubItemKey === getNavItemKey(subItem, item.title)} />
                  ) : null}
                  <span>{subItem.title}</span>
                  {subItem.badge ? <NavBadge>{subItem.badge}</NavBadge> : null}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function SidebarMenuCollapsedDropdown({
  item,
  href,
}: {
  item: NavCollapsibleItem;
  href: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [hoveredSubItemKey, setHoveredSubItemKey] = useState<string | null>(null);

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              isActive={checkIsActive(href, item)}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              tooltip={item.title}
            />
          }
        >
          {item.icon ? <item.icon hovered={hovered} /> : null}
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
              onMouseEnter={() => setHoveredSubItemKey(getNavItemKey(sub, item.title))}
              onMouseLeave={() => setHoveredSubItemKey(null)}
              render={<NavLink to={sub.url} />}
            >
              {sub.icon ? (
                <sub.icon hovered={hoveredSubItemKey === getNavItemKey(sub, item.title)} />
              ) : null}
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
  const pathname = href.split("?")[0] ?? href;
  const itemUrl = isNavLinkItem(item) ? item.url : "";
  const activeMatchPrefix = isNavLinkItem(item) ? item.activeMatchPrefix : undefined;

  return (
    href === itemUrl ||
    pathname === itemUrl ||
    (activeMatchPrefix !== undefined &&
      pathname.startsWith(activeMatchPrefix) &&
      (pathname === activeMatchPrefix ||
        pathname.startsWith(`${activeMatchPrefix}/`))) ||
    ("items" in item && item.items.some((subItem) => subItem.url === href)) ||
    (mainNav &&
      "items" in item &&
      href.split("/")[1] !== "" &&
      href.split("/")[1] === item.items[0]?.url.split("/")[1])
  );
}
