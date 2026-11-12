"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { CornerDownLeft, SearchIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBusinessCan, useOpensPartnerBilling } from "@/components/business-capabilities-provider";
import { registerSearch } from "@/components/navigation/search-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents } from "@/hooks/use-agents";
import type { InboxPage } from "@/components/inbox/inbox-data";
import { getChannelLabel, getContactDisplayName } from "@/lib/contact-display";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";
import { searchCatalog, searchSynonyms, type SearchEntry, type Translate } from "./catalog";
import { allowed, foldText, searchEntries } from "./search";
import { ContactIcon, ConversationIcon, entryIcon } from "./search-icons";

type Group = "pages" | "agents" | "knowledge" | "services" | "employees" | "rules" | "contacts" | "conversations";
/** One row: its icon, where it lives (muted, before the title), and what it's called. */
type Result = { id: string; title: string; section: string | null; href: string; group: Group; icon: LucideIcon; detail?: string };

/** The pages an empty search suggests, in the sidebar's order: the main pages, then Business and Settings. */
const SUGGESTED_PAGES = ["home", "inbox", "appointments", "contacts", "analytics", "agents"];
const isAgent = (entry: SearchEntry) => /^agent:[^:]+$/u.test(entry.id);
const isSettingsPage = (entry: SearchEntry) => /^\/(business|workspace|account)(\/|$)/u.test(entry.id);
type ContactRow = { id: string; name: string | null; phone: string | null; email: string | null; channels?: string[] };

/** Live results need two letters, so one keystroke doesn't search every contact. */
const LIVE_MIN_LENGTH = 2;
const LIVE_LIMIT = 4;

/** Whether every word of the query is in the text, without accents or case, as page search matches. */
function matches(query: string, text: string): boolean {
  const folded = foldText(text);
  return foldText(query).split(/\s+/u).filter(Boolean).every((word) => folded.includes(word));
}

/**
 * Knowledge entries, services and employees, and each agent's rules, whose
 * names match the query. The lists come from the APIs and cache keys their
 * pages use, so opening search after a page costs nothing. Setup only, as
 * those pages need.
 */
function useSetupResults(businessId: string | undefined, query: string, enabled: boolean) {
  const { t } = useTranslation("nav");
  const { agents } = useAgents();
  const on = enabled && Boolean(businessId);
  const id = encodeURIComponent(businessId ?? "");
  const documents = useQuery({ queryKey: ["knowledge", businessId], enabled: on, queryFn: () => requestJson<{ documents: Array<{ id: string; title: string }> }>(`/api/knowledge?businessId=${id}`) });
  const snippets = useQuery({ queryKey: ["knowledge-snippets", businessId], enabled: on, queryFn: () => requestJson<{ snippets: Array<{ id: string; title: string }> }>(`/api/knowledge/snippets?businessId=${id}`) });
  const catalog = useQuery({ queryKey: ["catalog", businessId], enabled: on, queryFn: () => requestJson<{ services: Array<{ id: string; name: string }> }>(`/api/catalog?businessId=${id}&limit=100`) });
  const employees = useQuery({ queryKey: ["search", businessId, "employees", query], enabled: on, placeholderData: keepPreviousData, queryFn: () => requestJson<{ employees: Array<{ id: string; name: string }> }>(`/api/employees?businessId=${id}&limit=${LIVE_LIMIT}&offset=0&search=${encodeURIComponent(query)}`) });
  const rules = useQueries({ queries: agents.map((agent) => ({ queryKey: ["rules", businessId, agent.id], enabled: on, queryFn: () => requestJson<Array<{ id: string; title: string }>>(`/api/rules?businessId=${id}&agentId=${encodeURIComponent(agent.id)}`) })) });
  if (!on) return { results: [] as Result[], loading: false };
  const business = t("items.business");
  const found = <T,>(rows: T[] | undefined, name: (row: T) => string) => (Array.isArray(rows) ? rows : []).filter((row) => matches(query, name(row))).slice(0, LIVE_LIMIT);
  const knowledge = [...(documents.data?.documents ?? []), ...(snippets.data?.snippets ?? [])];
  const results: Result[] = [
    ...found(knowledge, (row) => row.title).map((row): Result => ({ id: `knowledge:${row.id}`, title: row.title, section: `${business} › ${t("settingsPages.knowledge")}`, href: "/business/knowledge", group: "knowledge", icon: entryIcon("", "/business/knowledge") })),
    ...found(catalog.data?.services, (row) => row.name).map((row): Result => ({ id: `service:${row.id}`, title: row.name, section: `${business} › ${t("settingsPages.services")}`, href: "/business/services", group: "services", icon: entryIcon("", "/business/services") })),
    ...(employees.data?.employees ?? []).slice(0, LIVE_LIMIT).map((row): Result => ({ id: `employee:${row.id}`, title: row.name, section: `${business} › ${t("settingsPages.employees")}`, href: "/business/employees", group: "employees", icon: entryIcon("", "/business/employees") })),
    ...agents.flatMap((agent, index) => found(rules[index]?.data, (row) => row.title).map((row): Result => ({ id: `rule:${agent.id}:${row.id}`, title: row.title, section: `${agent.name} › ${t("agentPages.rules")}`, href: `/agents/${agent.id}/rules`, group: "rules", icon: entryIcon(`agent:${agent.id}:rules`, "") }))),
  ].slice(0, LIVE_LIMIT * 4);
  const pending = documents.isPending || snippets.isPending || catalog.isPending || employees.isPending || rules.some((rule) => rule.isPending);
  return { results, loading: pending && !results.length };
}

/** Contacts and conversations matching the query, through the same APIs their pages use. Activity only. */
function useLiveResults(businessId: string | undefined, query: string, enabled: boolean) {
  const { i18n, t } = useTranslation(["nav", "common"]);
  const search = encodeURIComponent(query);
  const on = enabled && Boolean(businessId);
  const contacts = useQuery({ queryKey: ["search", businessId, "contacts", query], enabled: on, placeholderData: keepPreviousData, queryFn: () => requestJson<{ contacts: ContactRow[] }>(`/api/contacts?businessId=${encodeURIComponent(businessId!)}&limit=${LIVE_LIMIT}&search=${search}`) });
  const inbox = useQuery({ queryKey: ["search", businessId, "inbox", query], enabled: on, placeholderData: keepPreviousData, queryFn: () => requestJson<InboxPage>(`/api/inbox?businessId=${encodeURIComponent(businessId!)}&limit=${LIVE_LIMIT}&search=${search}`) });
  if (!on) return { results: [] as Result[], loading: false };
  const day = (value: string) => formatDateTime(value, i18n.language, { month: "short", day: "numeric" });
  const results: Result[] = [
    ...(contacts.data?.contacts ?? []).map((contact): Result => ({ id: `contact:${contact.id}`, title: getContactDisplayName(contact, i18n.language, t), section: t("nav:items.contacts"), href: `/contacts/${contact.id}`, group: "contacts", icon: ContactIcon })),
    ...(inbox.data?.items ?? []).map((item): Result => ({
      id: item.key,
      title: getContactDisplayName({ name: item.contactName, phone: item.contactPhone, email: item.contactEmail, channels: [item.channel] }, i18n.language, t),
      section: t("nav:items.inbox"),
      detail: t("nav:search.detail.conversation", { channel: getChannelLabel(item.channel, t), date: day(item.occurredAt) }),
      href: item.kind === "call" ? `/inbox?call=${encodeURIComponent(item.id)}` : `/inbox?conversation=${encodeURIComponent(item.id)}`,
      group: "conversations",
      icon: ConversationIcon,
    })),
  ];
  return { results, loading: (contacts.isPending || inbox.isPending) && !results.length };
}

function SearchPanel({ businessId, onClose }: { businessId: string | undefined; onClose: () => void }) {
  const { t } = useTranslation("nav");
  const router = useRouter();
  const can = useBusinessCan();
  const opensPartnerBilling = useOpensPartnerBilling();
  const { agents } = useAgents();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);
  const scope = useMemo(() => {
    const translate: Translate = (key, options) => options ? t(key, options as never) : t(key);
    return { entries: searchCatalog(translate, agents), synonyms: searchSynonyms(translate), can, opensPartnerBilling };
  }, [agents, can, opensPartnerBilling, t]);
  const live = useLiveResults(businessId, query, query.length >= LIVE_MIN_LENGTH && can("activity"));
  const setup = useSetupResults(businessId, query, query.length >= LIVE_MIN_LENGTH && can("setup"));
  const loading = live.loading || setup.loading;
  const results = useMemo<Result[]>(() => {
    const main = t("search.where.main");
    // Settings and Business pages read "Settings › Team" and "Business › Knowledge"; the main pages need no place.
    const section = (entry: SearchEntry) => entry.where === main ? null : entry.href.startsWith("/business") ? t("items.business") : /^\/(workspace|account)(\/|$)/u.test(entry.href) ? t("items.settings") : entry.where;
    const row = (entry: SearchEntry): Result => ({ id: entry.id, title: entry.title, section: section(entry), href: entry.href, group: entry.id.startsWith("agent:") ? "agents" : "pages", icon: entryIcon(entry.id, entry.href) });
    // With nothing typed, it suggests the pages and agents the person may open.
    if (!text.trim()) {
      const open = scope.entries.filter((entry) => allowed(entry, scope));
      const pages = SUGGESTED_PAGES.flatMap((id) => open.filter((entry) => entry.id === id));
      return [...pages, ...open.filter(isSettingsPage), ...open.filter(isAgent)].map(row);
    }
    // Grouped the way they show, so the arrow keys follow the list from top to bottom.
    const found = searchEntries(text, scope).map(row);
    return [...found.filter((result) => result.group === "pages"), ...found.filter((result) => result.group === "agents"), ...setup.results, ...live.results];
  }, [live.results, scope, setup.results, t, text]);
  const selected = Math.min(active, Math.max(results.length - 1, 0));
  const groups = (["pages", "agents", "knowledge", "services", "employees", "rules", "contacts", "conversations"] as const).filter((group) => results.some((result) => result.group === group));

  function go(result: Result | undefined) {
    if (!result) return;
    onClose();
    router.push(result.href);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(Math.min(selected + 1, results.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive(Math.max(selected - 1, 0)); }
    if (event.key === "Enter") { event.preventDefault(); go(results[selected]); }
  }

  const optionId = (result: Result) => `search-option-${result.id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  return (
    <div className="flex max-h-[min(32rem,calc(100dvh-8rem))] min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b px-4">
        <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-activedescendant={results[selected] ? optionId(results[selected]) : undefined}
          aria-autocomplete="list"
          aria-controls="search-results"
          aria-expanded={results.length > 0}
          aria-label={t("search.title")}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent type-body outline-none placeholder:text-muted-foreground"
          onChange={(event) => { setText(event.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder={t("search.placeholder")}
          role="combobox"
          spellCheck={false}
          value={text}
        />
        <button aria-label={t("search.keys.close")} className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" onClick={onClose} type="button"><Key>Esc</Key></button>
      </div>
      <div aria-label={t("search.title")} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2" id="search-results" role="listbox">
        {text.trim() && !results.length && !loading ? <p className="type-body-muted px-3 py-6 text-center">{t("search.empty", { query: text.trim() })}</p> : null}
        {groups.map((group) => (
          <div className="pb-1" key={group} role="group" aria-label={t(`search.groups.${group}`)}>
            <p aria-hidden="true" className="type-meta px-3 pt-2 pb-1">{t(`search.groups.${group}`)}</p>
            {results.filter((result) => result.group === group).map((result) => {
              const current = results[selected]?.id === result.id;
              const Icon = result.icon;
              return (
                <div
                  aria-selected={current}
                  className={cn("flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left type-body", current && "bg-accent text-accent-foreground")}
                  id={optionId(result)}
                  key={result.id}
                  onClick={() => go(result)}
                  // The input keeps focus and moves through the options; a click or Enter on one opens it too.
                  onKeyDown={(event) => { if (event.key === "Enter") go(result); }}
                  onMouseEnter={() => setActive(results.indexOf(result))}
                  role="option"
                  tabIndex={-1}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate">
                    {result.section ? <><span className="shrink-0 text-muted-foreground">{result.section}</span><span aria-hidden="true" className="text-muted-foreground">›</span></> : null}
                    <span className={cn("truncate font-medium", (result.group === "contacts" || result.group === "conversations") && "ph-mask")}>{result.title}</span>
                    {result.detail ? <span className="shrink-0 type-caption text-muted-foreground">{result.detail}</span> : null}
                  </span>
                  {current ? <CornerDownLeft aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                </div>
              );
            })}
          </div>
        ))}
        {loading ? (
          <div aria-busy="true" aria-label={t("search.loading")} className="pb-1" data-testid="search-live-loading" role="status">
            <Skeleton className="mx-3 mt-2 mb-1 h-4 w-24" />
            {Array.from({ length: 2 }, (_, index) => <div className="flex items-center gap-3 px-3 py-2" key={index}><Skeleton className="size-4" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-40" /></div>)}
          </div>
        ) : null}
      </div>
      <div aria-hidden="true" className="flex items-center gap-4 border-t px-4 py-2 type-caption text-muted-foreground">
        <span className="flex items-center gap-1.5"><Key>↑</Key><Key>↓</Key>{t("search.keys.select")}</span>
        <span className="flex items-center gap-1.5"><Key>↵</Key>{t("search.keys.open")}</span>
      </div>
    </div>
  );
}

/** A keyboard key, as the footer and the Esc button show it. */
function Key({ children }: { children: string }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-sans type-meta">{children}</kbd>;
}

/**
 * Search, from the sidebar's button or ⌘K anywhere in the dashboard. It
 * lists only what the person may open: pages and settings by their access,
 * agents with setup, and contacts and conversations with activity.
 */
export function SearchDialog({ businessId }: { businessId: string | undefined }) {
  const { t } = useTranslation("nav");
  const [open, setOpen] = useState(false);
  useEffect(() => registerSearch(() => setOpen(true)), []);
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((current) => !current); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only"><DialogTitle>{t("search.title")}</DialogTitle><DialogDescription>{t("search.description")}</DialogDescription></DialogHeader>
        {open ? <SearchPanel businessId={businessId} onClose={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}
