"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBusinessCan, useOpensPartnerBilling } from "@/components/business-capabilities-provider";
import { registerSearch } from "@/components/navigation/search-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents } from "@/hooks/use-agents";
import type { InboxPage } from "@/components/inbox/inbox-data";
import { getChannelLabel, getContactDisplayName } from "@/lib/contact-display";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";
import { searchCatalog, searchSynonyms, type Translate } from "./catalog";
import { searchEntries } from "./search";

type Result = { id: string; title: string; where: string; href: string; group: "pages" | "contacts" | "conversations" };
type ContactRow = { id: string; name: string | null; phone: string | null; email: string | null; channels?: string[] };

/** Live results need two letters, so one keystroke doesn't search every contact. */
const LIVE_MIN_LENGTH = 2;
const LIVE_LIMIT = 4;

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
    ...(contacts.data?.contacts ?? []).map((contact): Result => ({ id: `contact:${contact.id}`, title: getContactDisplayName(contact, i18n.language, t), where: t("nav:items.contacts"), href: `/contacts/${contact.id}`, group: "contacts" })),
    ...(inbox.data?.items ?? []).map((item): Result => ({
      id: item.key,
      title: getContactDisplayName({ name: item.contactName, phone: item.contactPhone, email: item.contactEmail, channels: [item.channel] }, i18n.language, t),
      where: t("nav:search.where.conversation", { channel: getChannelLabel(item.channel, t), date: day(item.occurredAt) }),
      href: item.kind === "call" ? `/inbox?call=${encodeURIComponent(item.id)}` : `/inbox?conversation=${encodeURIComponent(item.id)}`,
      group: "conversations",
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
  const results = useMemo<Result[]>(() => [
    ...searchEntries(text, scope).map((entry): Result => ({ id: entry.id, title: entry.title, where: entry.where, href: entry.href, group: "pages" })),
    ...live.results,
  ], [live.results, scope, text]);
  const selected = Math.min(active, Math.max(results.length - 1, 0));
  const groups = (["pages", "contacts", "conversations"] as const).filter((group) => results.some((result) => result.group === group));

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
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-activedescendant={results[selected] ? optionId(results[selected]) : undefined}
          aria-controls="search-results"
          aria-label={t("search.title")}
          className="pl-10"
          onChange={(event) => { setText(event.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder={t("search.placeholder")}
          role="combobox"
          aria-expanded={results.length > 0}
          value={text}
        />
      </div>
      <div className="max-h-96 min-h-16 overflow-y-auto" id="search-results" role="listbox" aria-label={t("search.title")}>
        {text.trim() && !results.length && !live.loading ? <p className="type-body-muted px-3 py-4">{t("search.empty", { query: text.trim() })}</p> : null}
        {groups.map((group) => (
          <div className="py-1" key={group} role="group" aria-label={t(`search.groups.${group}`)}>
            <p aria-hidden="true" className="type-meta px-3 py-1">{t(`search.groups.${group}`)}</p>
            {results.filter((result) => result.group === group).map((result) => (
              <div
                aria-selected={results[selected]?.id === result.id}
                className={cn("flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm", results[selected]?.id === result.id && "bg-muted")}
                id={optionId(result)}
                key={result.id}
                onClick={() => go(result)}
                // The input keeps focus and moves through the options; a click or Enter on one opens it too.
                onKeyDown={(event) => { if (event.key === "Enter") go(result); }}
                onMouseEnter={() => setActive(results.indexOf(result))}
                role="option"
                tabIndex={-1}
              >
                <span className={cn("truncate font-medium", result.group !== "pages" && "ph-mask")}>{result.title}</span>
                <span className="type-meta shrink-0">{result.where}</span>
              </div>
            ))}
          </div>
        ))}
        {live.loading ? (
          <div aria-busy="true" aria-label={t("search.loading")} className="py-1" data-testid="search-live-loading" role="status">
            <Skeleton className="mx-3 my-1 h-4 w-24" />
            {Array.from({ length: 2 }, (_, index) => <div className="flex items-center justify-between gap-4 px-3 py-2" key={index}><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-28" /></div>)}
          </div>
        ) : null}
      </div>
    </div>
  );
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
      <DialogContent className="top-[15%] translate-y-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="sr-only"><DialogTitle>{t("search.title")}</DialogTitle><DialogDescription>{t("search.description")}</DialogDescription></DialogHeader>
        {open ? <SearchPanel businessId={businessId} onClose={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}
