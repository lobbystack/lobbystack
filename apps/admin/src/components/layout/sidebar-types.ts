import type { ReactNode } from "react";

type User = {
  name: string;
  email: string;
  avatar?: string;
};

type Team = {
  name: string;
  logo: React.ElementType;
  plan?: string;
};

type SidebarIconProps = {
  hovered?: boolean;
  className?: string;
};

type BaseNavItem = {
  title: string;
  badge?: string;
  icon?: React.ComponentType<SidebarIconProps>;
};

type NavLinkItem = BaseNavItem & {
  activeMatchPrefix?: string;
  url: string;
  items?: never;
};

type NavCollapsibleItem = BaseNavItem & {
  items: (BaseNavItem & { url: string })[];
  url?: never;
};

type NavItem = NavCollapsibleItem | NavLinkItem;

type NavGroup = {
  title: string;
  items: NavItem[];
};

type SidebarData = {
  user: User;
  teams: Team[];
  navGroups: NavGroup[];
};

export type {
  SidebarData,
  NavGroup,
  NavItem,
  NavCollapsibleItem,
  NavLinkItem,
  User,
  Team,
  SidebarIconProps,
};
