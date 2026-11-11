"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Ref } from "react";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useNavLinks, type NavLink, type NavLinkId } from "./nav-group";

/** The pages with a tab of their own. Everything else is under Menu. */
export const TAB_LINKS = ["home", "inbox", "appointments", "contacts"] as const satisfies readonly NavLinkId[];

function isActive(link: NavLink, pathname: string): boolean {
  return link.isActive ? link.isActive(pathname) : pathname === link.href || pathname.startsWith(`${link.href}/`);
}

const TAB_CLASS = "relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl type-meta outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-ring data-active:text-foreground [&_svg]:size-5 [&_svg]:shrink-0";

/**
 * The phone's bottom tab bar: Home, the Inbox, appointments and contacts,
 * with a dot where the sidebar shows a count, and Menu for everything else.
 * Menu stays lit on the pages it holds.
 */
export function MobileTabBar({ menuButtonRef, menuOpen, onOpenMenu }: { menuButtonRef?: Ref<HTMLButtonElement>; menuOpen: boolean; onOpenMenu: () => void }) {
  const { t } = useTranslation("nav");
  const pathname = usePathname();
  const { allowed, links } = useNavLinks();
  const tabs = allowed(TAB_LINKS.map((id) => ({ ...links[id], label: t(`mobileNav.tabs.${id}`), id })));
  const onTab = tabs.some((tab) => isActive(tab, pathname));
  return (
    <nav aria-label={t("mobileNav.label")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden" data-mobile-tab-bar="">
      <ul className="mx-auto flex h-14 max-w-lg items-stretch px-2">
        {tabs.map((tab) => {
          const active = !menuOpen && isActive(tab, pathname);
          const Icon = tab.icon;
          return (
            <li className="flex min-w-0 flex-1 p-1" key={tab.href}>
              <Link aria-current={active ? "page" : undefined} className={TAB_CLASS} data-active={active ? "" : undefined} href={tab.href}>
                <span className="relative">
                  <Icon aria-hidden="true" className="size-5 [&_svg]:size-5" size={20} />
                  {tab.badge ? <span aria-hidden="true" className="absolute -top-0.5 -right-1 size-2 rounded-full bg-primary ring-2 ring-background" data-attention-dot="" /> : null}
                </span>
                <span className="max-w-full truncate">{tab.label}</span>
                {tab.badge ? <span className="sr-only">{t("items.newCount", { count: tab.badge })}</span> : null}
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1 p-1">
          <button aria-expanded={menuOpen} aria-haspopup="dialog" className={TAB_CLASS} data-active={menuOpen || !onTab ? "" : undefined} onClick={onOpenMenu} ref={menuButtonRef} type="button">
            <Menu aria-hidden="true" />
            <span className="max-w-full truncate">{t("mobileNav.menu")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
