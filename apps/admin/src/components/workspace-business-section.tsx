"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { intlLocale, runtimeLocales, type RuntimeLocale } from "@lobbystack/shared";
import { currencyRegion, runtimeLocaleRegion } from "@/lib/country-flag";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { BusinessHoursSection } from "@/components/business-hours-section";
import { useTelemetry } from "@/components/product-analytics";
import { settingRowClassName } from "@/components/text-setting-row";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/flag";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxSearch, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { agentSettingsQueryKey, fetchAgentSettings, useAgentSettingsQuery, useSaveWorkspace, type AgentSettings, type WorkspacePatch } from "@/hooks/use-agent-settings";
import { availableTimeZones, groupTimeZones, isTimeZoneRegion, type TimeZoneOption } from "@/lib/time-zones";
import { cn } from "@/lib/utils";

type TimeZoneItemGroup = { value: string; label: string; items: TimeZoneOption[] };

type CurrencyOption = { id: string; label: string };

// Matches SelectTrigger, so the searchable timezone picker looks like the selects beside it.
const COMBOBOX_TRIGGER_CLASS = "flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-xl border border-input bg-input/30 px-3 py-2 type-body whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-56";

/** The workspace's business details, which every agent shares: summary, languages, time zone, currency and opening hours. */
export function WorkspaceBusinessSection({ businessId, canManage, heading = true }: { businessId: string; canManage: boolean; /** Off on the page of the same name, whose header already says it. */ heading?: boolean }) {
  const { i18n, t } = useTranslation(["agent", "common", "settings"]);
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const query = useAgentSettingsQuery(businessId);
  const saveWorkspace = useSaveWorkspace(businessId);
  const configuration = query.data;
  const isLoadingConfiguration = !businessId || query.isLoading;
  const persistedProfile = configuration?.profile;
  const canRewriteSummary = configuration?.hasKnowledgeSources !== false;
  // The sign-up placeholder isn't a summary, so it shows as empty.
  const savedSummary = persistedProfile && persistedProfile.summarySource !== "placeholder" ? persistedProfile.summary : "";
  const savedTimezone = configuration?.business?.timezone ?? "";
  // Built once the business's zone loads, so the server render and hydration agree.
  const timeZoneGroups = useMemo(() => savedTimezone ? groupTimeZones(availableTimeZones(savedTimezone), intlLocale(i18n.language)) : [], [savedTimezone, i18n.language]);
  const timeZoneItems = useMemo<TimeZoneItemGroup[]>(() => timeZoneGroups.map((group) => ({
    value: group.region ?? "",
    label: group.region === null ? "" : isTimeZoneRegion(group.region) ? t(`agent:fields.timezone.regions.${group.region.toLowerCase()}`) : group.region,
    items: group.zones,
  })), [t, timeZoneGroups]);
  const currencyItems = useMemo<CurrencyOption[]>(() => {
    const names = new Intl.DisplayNames([intlLocale(i18n.language)], { type: "currency", fallback: "code" });
    return Intl.supportedValuesOf("currency").map((code) => ({ id: code, label: `${code} · ${names.of(code) ?? code}` }));
  }, [i18n.language]);

  const [summary, setSummary] = useState("");
  const [summaryStatus, setSummaryStatus] = useState<string | null>(null);
  const [isSummarySaving, setIsSummarySaving] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  // While a requested rewrite runs, a separate query checks on it, so the page's drafts aren't reset every few seconds.
  const [awaitingRewrite, setAwaitingRewrite] = useState(false);
  // The rewritten summary as typed out so far in the open dialog; null when nothing is being typed.
  const [typedSummary, setTypedSummary] = useState<string | null>(null);
  const [typingTarget, setTypingTarget] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const rewritingInDialog = isSummaryOpen && (awaitingRewrite || typingTarget !== null);
  const rewriteStatus = persistedProfile?.summaryRegenerateStatus;
  useEffect(() => {
    if (rewriteStatus !== "pending") return;
    setAwaitingRewrite(true);
    setSummaryStatus(t("agent:fields.summary.regenerating"));
  }, [rewriteStatus, t]);
  const rewrite = useQuery({
    queryKey: ["agent-summary-rewrite", businessId],
    queryFn: () => fetchAgentSettings(businessId),
    enabled: awaitingRewrite,
    refetchInterval: 3000,
  });
  useEffect(() => {
    const latest = rewrite.data;
    const outcome = latest?.profile?.summaryRegenerateStatus;
    if (!awaitingRewrite || !latest || outcome === "pending") return;
    setAwaitingRewrite(false);
    setSummaryStatus(null);
    queryClient.removeQueries({ queryKey: ["agent-summary-rewrite", businessId] });
    queryClient.setQueryData(agentSettingsQueryKey(businessId), latest);
    if (outcome === "completed" && isSummaryOpen && !reduceMotion && latest.profile?.summary) {
      setTypedSummary("");
      setTypingTarget(latest.profile.summary);
    } else if (outcome === "completed") toast.success(t("agent:fields.summary.rewriteCompleted"));
    else if (outcome === "empty") toast.warning(t("agent:fields.summary.rewriteEmpty"));
    else if (outcome === "failed") toast.error(t("agent:fields.summary.rewriteFailed"));
  }, [awaitingRewrite, businessId, isSummaryOpen, queryClient, reduceMotion, rewrite.data, t]);
  useEffect(() => {
    if (typingTarget === null) return;
    // About 1.5 seconds whatever the length, at one frame per step.
    const step = Math.max(1, Math.ceil(typingTarget.length / 90));
    let length = 0;
    const intervalId = window.setInterval(() => {
      length = Math.min(typingTarget.length, length + step);
      setTypedSummary(typingTarget.slice(0, length));
      if (length < typingTarget.length) return;
      window.clearInterval(intervalId);
      setTypedSummary(null);
      setTypingTarget(null);
      toast.success(t("agent:fields.summary.rewriteCompleted"));
    }, 16);
    return () => window.clearInterval(intervalId);
  }, [t, typingTarget]);

  const [defaultLocale, setDefaultLocale] = useState<RuntimeLocale>("en");
  const [isLocaleSaving, setIsLocaleSaving] = useState(false);
  // "default" follows the caller language.
  const [teamLocale, setTeamLocale] = useState<RuntimeLocale | "default">("default");
  const [isTeamLocaleSaving, setIsTeamLocaleSaving] = useState(false);
  const [timezone, setTimezone] = useState("");
  const [isTimezoneSaving, setIsTimezoneSaving] = useState(false);
  const [currency, setCurrency] = useState("");
  const [isCurrencySaving, setIsCurrencySaving] = useState(false);
  // The summary draft only takes a refetched value while it still holds the last one, so a refetch doesn't undo typing.
  const syncedBusinessId = useRef(businessId);
  const syncedProfile = useRef<NonNullable<AgentSettings["profile"]> | null>(null);
  useEffect(() => {
    if (syncedBusinessId.current !== businessId) {
      syncedBusinessId.current = businessId;
      syncedProfile.current = null;
    }
    setTimezone(configuration?.business?.timezone ?? "");
    setCurrency(configuration?.business?.currency ?? "");
    setDefaultLocale(configuration?.business?.defaultLocale ?? "en");
    setTeamLocale(configuration?.business?.teamLocale ?? "default");
    const profile = configuration?.profile;
    if (!profile) return;
    const previous = syncedProfile.current;
    syncedProfile.current = profile;
    const shownSummary = (value: NonNullable<AgentSettings["profile"]>) => value.summarySource === "placeholder" ? "" : value.summary;
    setSummary((current) => !previous || current === shownSummary(previous) ? shownSummary(profile) : current);
  }, [businessId, configuration]);

  async function save(patch: WorkspacePatch, setting: string, refetchType: "active" | "none" = "active"): Promise<boolean> {
    try {
      await saveWorkspace(patch, refetchType);
      telemetry.track("web.agent.settings_saved", { businessId, setting });
      toast.success(t("agent:actions.saved"));
      return true;
    } catch {
      toast.error(t("agent:actions.saveFailed"));
      return false;
    }
  }

  async function saveSummary(regenerate: boolean): Promise<void> {
    if (!canManage || !persistedProfile || (!regenerate && !summary.trim())) return;
    setIsSummarySaving(true);
    setSummaryStatus(null);
    try {
      await saveWorkspace(regenerate ? { regenerateSummary: true } : { summary: summary.trim() });
      telemetry.track("web.agent.settings_saved", { businessId, setting: regenerate ? "summary_regenerated" : "summary" });
      setSummaryStatus(regenerate ? t("agent:fields.summary.regenerating") : null);
      if (regenerate) setAwaitingRewrite(true);
      else {
        toast.success(t("agent:actions.saved"));
        setIsSummaryOpen(false);
      }
    } catch {
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsSummarySaving(false);
    }
  }

  async function saveLocale(next: RuntimeLocale) {
    if (!canManage || !persistedProfile) return;
    setIsLocaleSaving(true);
    await save({ defaultLocale: next }, "default_locale");
    setIsLocaleSaving(false);
  }

  async function saveTeamLocale(next: RuntimeLocale | "default") {
    if (!canManage || !persistedProfile) return;
    setIsTeamLocaleSaving(true);
    await save({ teamLocale: next === "default" ? null : next }, "team_locale");
    setIsTeamLocaleSaving(false);
  }

  async function saveTimezone(nextTimezone: string): Promise<void> {
    if (!canManage) return;
    const previous = timezone;
    setTimezone(nextTimezone);
    setIsTimezoneSaving(true);
    // A refetch resets every unsaved draft on this page, so the saved settings only go stale.
    if (!await save({ timezone: nextTimezone }, "timezone", "none")) setTimezone(previous);
    setIsTimezoneSaving(false);
  }

  async function saveCurrency(nextCurrency: string): Promise<void> {
    if (!canManage) return;
    const previous = currency;
    setCurrency(nextCurrency);
    setIsCurrencySaving(true);
    try {
      await saveWorkspace({ currency: nextCurrency }, "none");
      // Service prices show in this currency.
      await queryClient.invalidateQueries({ queryKey: ["catalog", businessId] });
      telemetry.track("web.agent.settings_saved", { businessId, setting: "currency" });
      toast.success(t("agent:actions.saved"));
    } catch {
      setCurrency(previous);
      toast.error(t("agent:actions.saveFailed"));
    } finally {
      setIsCurrencySaving(false);
    }
  }

  return (
    <div aria-busy={isLoadingConfiguration || undefined} className="flex w-full flex-col gap-8">
      <section className="flex flex-col gap-3">
        {heading ? <h2 className="type-title">{t("agent:businessDetails.title")}</h2> : null}
        <Surface className="flex flex-col">
          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:fields.summary.label")}</ItemTitle>
              <ItemDescription>{t("agent:fields.summary.hint")}</ItemDescription>
              {summaryStatus ? <ItemDescription>{summaryStatus}</ItemDescription> : null}
            </ItemContent>
            <ItemActions className="w-full justify-end self-center sm:w-auto">
              <Button
                aria-label={t("agent:actions.editField", { field: t("agent:fields.summary.label") })}
                disabled={isLoadingConfiguration || !persistedProfile || !canManage}
                onClick={() => {
                  setSummary(savedSummary);
                  setSummaryStatus(null);
                  setIsSummaryOpen(true);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("agent:actions.edit")}
              </Button>
            </ItemActions>
            <Dialog onOpenChange={(open) => {
              if (open || isSummarySaving) return;
              setIsSummaryOpen(false);
              // Closing mid-typing skips to the end; the summary is already saved.
              if (typingTarget !== null) {
                setTypedSummary(null);
                setTypingTarget(null);
                toast.success(t("agent:fields.summary.rewriteCompleted"));
              }
            }} open={isSummaryOpen}>
              <DialogContent size="sm" className="flex flex-col gap-4">
                <DialogHeader><DialogTitle>{t("agent:fields.summary.label")}</DialogTitle></DialogHeader>
                <div className="relative overflow-hidden rounded-xl">
                  <Textarea
                    aria-busy={rewritingInDialog || undefined}
                    autoFocus
                    // The old text recedes while AI reads; the new text types in at full contrast.
                    className={cn("transition-opacity duration-300", isSummaryOpen && awaitingRewrite && "opacity-70")}
                    disabled={!canManage || isSummarySaving}
                    id="agent-summary"
                    maxLength={2000}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder={t("agent:fields.summary.placeholder")}
                    readOnly={rewritingInDialog}
                    rows={6}
                    value={typedSummary ?? summary}
                  />
                  {isSummaryOpen && awaitingRewrite && !reduceMotion ? (
                    // A soft band sweeps down the text while AI reads the knowledge.
                    <motion.div
                      animate={{ top: ["-4rem", "100%"] }}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 h-16 bg-linear-to-b from-transparent via-primary/15 to-transparent"
                      transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
                    />
                  ) : null}
                </div>
                {rewritingInDialog ? (
                  <p className="flex items-center gap-2 type-body-muted" role="status">
                    <Spinner aria-hidden="true" />
                    {t("agent:fields.summary.regenerating")}
                  </p>
                ) : null}
                <DialogFooter className="sm:justify-between">
                  {persistedProfile?.summarySource === "operator" ? (
                    <div className="flex flex-col gap-1">
                      <Button disabled={isSummarySaving || !canManage || !canRewriteSummary || awaitingRewrite} onClick={() => void saveSummary(true)} type="button" variant="ghost">
                        {t("agent:fields.summary.regenerate")}
                      </Button>
                      {!canRewriteSummary ? <p className="type-caption text-muted-foreground">{t("agent:fields.summary.rewriteNeedsKnowledge")}</p> : null}
                    </div>
                  ) : <span className="hidden sm:block" />}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button disabled={isSummarySaving} onClick={() => setIsSummaryOpen(false)} type="button" variant="outline">{t("agent:actions.cancel")}</Button>
                    <Button disabled={isSummarySaving || rewritingInDialog || !canManage || !summary.trim()} onClick={() => void saveSummary(false)} type="button">
                      {isSummarySaving ? t("agent:actions.saving") : t("agent:actions.save")}
                    </Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Item>

          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:fields.defaultLocale.label")}</ItemTitle>
              <ItemDescription>{t("agent:fields.defaultLocale.hint")}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              {isLoadingConfiguration ? (
                <Skeleton className="h-10 w-full rounded-md sm:w-52" />
              ) : (
                <Select
                  disabled={!canManage || isLocaleSaving}
                  items={runtimeLocales.map((code) => ({ value: code, label: t(`common:callerLanguage.${code}`) }))}
                  onValueChange={(value) => {
                    const nextLocale = ((value as RuntimeLocale | null) || "en");
                    setDefaultLocale(nextLocale);
                    void saveLocale(nextLocale);
                  }}
                  value={defaultLocale}
                >
                  <SelectTrigger aria-label={t("agent:fields.defaultLocale.label")} className="w-full sm:w-52 *:data-[slot=select-value]:gap-2" id="agent-default-language" loading={isLocaleSaving}><SelectValue>{(value: RuntimeLocale | null) => value ? <><Flag region={runtimeLocaleRegion(value)} /><span className="truncate">{t(`common:callerLanguage.${value}`)}</span></> : null}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {runtimeLocales.map((code) => <SelectItem key={code} value={code}><Flag region={runtimeLocaleRegion(code)} />{t(`common:callerLanguage.${code}`)}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </ItemActions>
          </Item>

          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:fields.teamLocale.label")}</ItemTitle>
              <ItemDescription>{t("agent:fields.teamLocale.hint")}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              {isLoadingConfiguration ? (
                <Skeleton className="h-10 w-full rounded-md sm:w-52" />
              ) : (
                <Select
                  disabled={!canManage || isTeamLocaleSaving}
                  items={[{ value: "default", label: t("agent:fields.teamLocale.sameAsCaller") }, ...runtimeLocales.map((code) => ({ value: code, label: t(`common:callerLanguage.${code}`) }))]}
                  onValueChange={(value) => {
                    const next = ((value as RuntimeLocale | "default" | null) || "default");
                    setTeamLocale(next);
                    void saveTeamLocale(next);
                  }}
                  value={teamLocale}
                >
                  <SelectTrigger aria-label={t("agent:fields.teamLocale.label")} className="w-full sm:w-52 *:data-[slot=select-value]:gap-2" id="agent-team-language" loading={isTeamLocaleSaving}><SelectValue>{(value: RuntimeLocale | "default" | null) => !value ? null : value === "default" ? t("agent:fields.teamLocale.sameAsCaller") : <><Flag region={runtimeLocaleRegion(value)} /><span className="truncate">{t(`common:callerLanguage.${value}`)}</span></>}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="default">{t("agent:fields.teamLocale.sameAsCaller")}</SelectItem>
                      {runtimeLocales.map((code) => <SelectItem key={code} value={code}><Flag region={runtimeLocaleRegion(code)} />{t(`common:callerLanguage.${code}`)}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </ItemActions>
          </Item>

          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:fields.timezone.label")}</ItemTitle>
              <ItemDescription>{t("agent:fields.timezone.hint")}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full min-w-0 sm:w-auto">
              {isLoadingConfiguration ? (
                <Skeleton className="h-10 w-full rounded-md sm:w-56" />
              ) : (
                <Combobox
                  disabled={isTimezoneSaving || !timezone || !canManage}
                  isItemEqualToValue={(item: TimeZoneOption, value: TimeZoneOption) => item.id === value.id}
                  items={timeZoneItems}
                  itemToStringLabel={(zone: TimeZoneOption) => zone.label}
                  onValueChange={(zone: TimeZoneOption | null) => { if (zone && zone.id !== timezone) void saveTimezone(zone.id); }}
                  value={timeZoneGroups.flatMap((group) => group.zones).find((zone) => zone.id === timezone) ?? null}
                >
                  <ComboboxTrigger aria-label={t("agent:fields.timezone.label")} className={COMBOBOX_TRIGGER_CLASS} id="agent-timezone" loading={isTimezoneSaving}>
                    <span className="min-w-0 flex-1 truncate text-left"><ComboboxValue /></span>
                  </ComboboxTrigger>
                  <ComboboxContent className="min-w-(--anchor-width)">
                    <ComboboxSearch clearSearchLabel={t("common:accessibility.clearSearch")} placeholder={t("agent:fields.timezone.search")} />
                    <ComboboxEmpty>{t("agent:fields.timezone.noResults")}</ComboboxEmpty>
                    <ComboboxList>
                      {(group: TimeZoneItemGroup) => (
                        <ComboboxGroup items={group.items} key={group.value}>
                          {group.label ? <ComboboxLabel>{group.label}</ComboboxLabel> : null}
                          <ComboboxCollection>{(zone: TimeZoneOption) => <ComboboxItem key={zone.id} value={zone}>{zone.label}</ComboboxItem>}</ComboboxCollection>
                        </ComboboxGroup>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            </ItemActions>
          </Item>

          <Item className={settingRowClassName} variant="default">
            <ItemContent>
              <ItemTitle>{t("agent:fields.currency.label")}</ItemTitle>
              <ItemDescription>{t("agent:fields.currency.hint")}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full min-w-0 sm:w-auto">
              {isLoadingConfiguration ? (
                <Skeleton className="h-10 w-full rounded-md sm:w-56" />
              ) : (
                <Combobox
                  disabled={isCurrencySaving || !currency || !canManage}
                  isItemEqualToValue={(item: CurrencyOption, value: CurrencyOption) => item.id === value.id}
                  items={currencyItems}
                  itemToStringLabel={(option: CurrencyOption) => option.label}
                  onValueChange={(option: CurrencyOption | null) => { if (option && option.id !== currency) void saveCurrency(option.id); }}
                  value={currencyItems.find((option) => option.id === currency) ?? null}
                >
                  <ComboboxTrigger aria-label={t("agent:fields.currency.label")} className={COMBOBOX_TRIGGER_CLASS} id="agent-currency" loading={isCurrencySaving}>
                    <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left"><ComboboxValue>{(option: CurrencyOption | null) => option ? <><Flag region={currencyRegion(option.id)} /><span className="truncate">{option.label}</span></> : null}</ComboboxValue></span>
                  </ComboboxTrigger>
                  <ComboboxContent className="min-w-(--anchor-width)">
                    <ComboboxSearch clearSearchLabel={t("common:accessibility.clearSearch")} placeholder={t("agent:fields.currency.search")} />
                    <ComboboxEmpty>{t("agent:fields.currency.noResults")}</ComboboxEmpty>
                    <ComboboxList>{(option: CurrencyOption) => <ComboboxItem key={option.id} value={option}><Flag region={currencyRegion(option.id)} />{option.label}</ComboboxItem>}</ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            </ItemActions>
          </Item>
          <BusinessHoursSection businessId={businessId} canManage={canManage} />
        </Surface>
      </section>
    </div>
  );
}
