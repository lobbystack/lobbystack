"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { buildSidebarModel, receptionistPath, RECEPTIONIST_SECTIONS, type NavigationSnapshot } from "@/lib/navigation-routes";

const OPEN_EVENT = "lobbystack:open-command-search";

/** Opens the command search from anywhere, for example the sidebar's search row. */
export function openCommandSearch(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export type CommandEntry = { id: string; group: "pages" | "receptionists" | "settings"; label: string; keywords: string; href: string };

const SETTINGS_PAGES = [
  { key: "usage", href: "/settings/usage" },
  { key: "billing", href: "/settings/plan" },
  { key: "business", href: "/settings/team" },
  { key: "appearance", href: "/settings/appearance" },
  { key: "notifications", href: "/settings/notifications" },
  { key: "account", href: "/settings/account" },
  { key: "apiKeys", href: "/settings/api-keys" },
  { key: "webhooks", href: "/integrations/webhooks" },
] as const;

/** Every page and receptionist page the search can jump to. */
export function commandEntries(navigation: NavigationSnapshot, t: (key: string, options?: Record<string, unknown>) => string): CommandEntry[] {
  const model = buildSidebarModel({ receptionists: navigation.receptionists, staffEnabled: navigation.staffEnabled, canCreateReceptionists: false });
  const pages = [...model.daily, ...model.business, ...model.setup].map((item) => ({ id: `page:${item.key}`, group: "pages" as const, label: t(`nav.${item.key}`), keywords: item.key, href: item.href }));
  const receptionists = navigation.receptionists.flatMap((receptionist) => RECEPTIONIST_SECTIONS.map((section) => ({
    id: `receptionist:${receptionist.id}:${section}`,
    group: "receptionists" as const,
    label: section === "overview" ? receptionist.name : t("command.receptionistPage", { name: receptionist.name, section: t(`sections.${section}`) }),
    keywords: `${receptionist.name} ${section}`,
    href: receptionistPath(receptionist.id, section),
  })));
  const settings = SETTINGS_PAGES.map((item) => ({ id: `settings:${item.key}`, group: "settings" as const, label: t(`command.settings.${item.key}`), keywords: `settings ${item.key}`, href: item.href }));
  return [...pages, ...receptionists, ...settings];
}

/** ⌘K / Ctrl+K search that jumps to any page or receptionist. */
export function CommandSearch({ navigation }: { navigation: NavigationSnapshot }) {
  const { t } = useTranslation("receptionists");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  const entries = commandEntries(navigation, (key, options) => t(key, options ?? {}));
  const groups = (["pages", "receptionists", "settings"] as const).map((group) => ({ group, items: entries.filter((entry) => entry.group === group) })).filter((group) => group.items.length > 0);

  return (
    <CommandDialog description={t("command.description")} onOpenChange={setOpen} open={open} title={t("command.title")}>
      <Command>
      <CommandInput placeholder={t("command.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("command.empty")}</CommandEmpty>
        {groups.map(({ group, items }) => (
          <CommandGroup heading={t(`command.groups.${group}`)} key={group}>
            {items.map((entry) => (
              <CommandItem key={entry.id} keywords={[entry.keywords]} onSelect={() => { setOpen(false); router.push(entry.href); }} value={`${entry.label} ${entry.id}`}>
                <span className="ph-mask truncate">{entry.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
