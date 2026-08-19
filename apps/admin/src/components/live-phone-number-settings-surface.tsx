"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, MapPin, Phone, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { PageSurface } from "./page-surface";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "./ui/item";
import { Surface } from "./ui/surface";

type Business = { businessId: string; name: string; active: boolean };
type NumberRow = { id: string; e164: string; voiceEnabled: boolean; smsEnabled: boolean; status: string; reclaimScheduledAt: string | null; reclaimReason: string | null };
type NumberOffer = { phoneE164: string; locality?: string; region?: string; countryCode: string; claimToken: string };
type Claim = { status: string; requestedE164: string; lastError: string | null } | null;
type NumbersResponse = { phoneNumbers: NumberRow[]; replacement: { reservedAt: string | null; usedAt: string | null; activeClaim: { id: string; status: string } | null } };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Request failed.");
  return await response.json() as T;
}

export function LivePhoneNumberSettingsSurface() {
  const queryClient = useQueryClient();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [countryCode, setCountryCode] = useState("CA");
  const [kind, setKind] = useState("local");
  const [areaCode, setAreaCode] = useState("");
  const [city, setCity] = useState("");
  const [offers, setOffers] = useState<NumberOffer[]>([]);
  const [claimId, setClaimId] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const numbers = useQuery({ queryKey: ["phone-numbers", business?.businessId], queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  useEffect(() => { if (numbers.data?.replacement.activeClaim) { setClaimId(numbers.data.replacement.activeClaim.id); setChooserOpen(true); } }, [numbers.data?.replacement.activeClaim]);
  const release = useMutation({ mutationFn: async (phoneNumberId: string) => await requestJson(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE", body: JSON.stringify({ phoneNumberId }) }), onSuccess: async () => await queryClient.invalidateQueries({ queryKey: ["phone-numbers", business?.businessId] }) });
  const search = useMutation({ mutationFn: async () => await requestJson<{ numbers: NumberOffer[] }>(`/api/phone-numbers/replacement/search?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ selection: { countryCode, kind, ...(areaCode ? { areaCode } : {}), ...(city ? { city } : {}) }, limit: 12 }) }), onSuccess: (result) => setOffers(result.numbers) });
  const claim = useMutation({ mutationFn: async (claimToken: string) => await requestJson<{ claimId: string }>(`/api/phone-numbers/replacement/claim?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ claimToken, idempotencyKey: crypto.randomUUID() }) }), onSuccess: (result) => setClaimId(result.claimId) });
  const claimStatus = useQuery({ queryKey: ["replacement-claim", business?.businessId, claimId], queryFn: async () => await requestJson<{ claim: Claim }>(`/api/phone-numbers/replacement/claim/${claimId}?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business && claimId), refetchInterval: (query) => ["reserved", "provisioning"].includes(query.state.data?.claim?.status ?? "") ? 1000 : false });
  useEffect(() => {
    if (claimStatus.data?.claim?.status === "claimed") {
      void queryClient.invalidateQueries({ queryKey: ["phone-numbers", business?.businessId] });
      setChooserOpen(false);
      setClaimId(null);
      setOffers([]);
    }
  }, [business?.businessId, claimStatus.data?.claim?.status, queryClient]);

  const rows = numbers.data?.phoneNumbers ?? [];
  const replacementUsed = Boolean(numbers.data?.replacement.usedAt);
  const replacementPending = claim.isPending || ["reserved", "provisioning"].includes(claimStatus.data?.claim?.status ?? "");
  const terminalClaim = claimStatus.data?.claim && ["failed", "unavailable"].includes(claimStatus.data.claim.status) ? claimStatus.data.claim : null;

  return (
    <PageSurface title="Phone numbers" description="Manage the Twilio numbers used for voice and SMS.">
      <ItemGroup spacing="section"><section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Current number</h2><Surface className="flex flex-col"><Item className="rounded-none border-0" variant="default">
        <ItemContent><ItemTitle className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" />{business?.name ?? "Active workspace"}</ItemTitle><ItemDescription>Twilio numbers used for voice and SMS.</ItemDescription></ItemContent><ItemActions><Button size="sm" variant="ghost" onClick={() => void numbers.refetch()}><RefreshCw className="size-4" />Refresh</Button></ItemActions>
      </Item>
          {businesses.isLoading || numbers.isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading numbers...</p> : null}
          {businesses.isError || numbers.isError ? <p className="py-12 text-center text-sm text-red-600">Phone numbers are unavailable.</p> : null}
          {!numbers.isLoading && !numbers.isError ? (
            <div className="space-y-3">
              {rows.length ? rows.map((number) => (
                <article key={number.id} className="flex flex-col gap-4 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{number.e164}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Voice {number.voiceEnabled ? "enabled" : "disabled"}; SMS {number.smsEnabled ? "enabled" : "disabled"}; <span className="capitalize">{number.status}</span></p>
                    {number.reclaimScheduledAt ? <p className="mt-1 text-xs font-medium text-amber-600">Release scheduled for {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(number.reclaimScheduledAt))}{number.reclaimReason === "replacement" ? " after replacement" : ""}</p> : null}
                  </div>
                  <Button variant="destructive" disabled={release.isPending || number.status !== "active" || Boolean(number.reclaimScheduledAt)} onClick={() => { if (window.confirm(`Release ${number.e164}? This disables calls and SMS and cannot be undone.`)) release.mutate(number.id); }}><Trash2 className="size-4" />Release number</Button>
                </article>
              )) : <p className="px-4 py-12 text-center text-sm text-muted-foreground">No phone numbers are assigned to this workspace.</p>}
              {release.isError ? <p className="px-4 pb-4 text-sm text-destructive">{release.error.message}</p> : null}
            </div>
          ) : null}
        </Surface></section>
        <section className="flex flex-col gap-3"><h2 className="font-heading text-sm leading-snug font-medium">Number replacement</h2><Surface>
        {rows.some((number) => number.status === "active" && !number.reclaimScheduledAt) ? (
          <div className="px-4 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-medium">One-time number replacement</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Choose a new number once. Your current number stays active for 30 days after the replacement connects.</p>
              </div>
              <Button variant="outline" disabled={replacementUsed || replacementPending} onClick={() => setChooserOpen((open) => !open)}>{chooserOpen ? <X className="size-4" /> : <ArrowRightLeft className="size-4" />}{replacementUsed ? "Replacement used" : chooserOpen ? "Close" : "Replace number"}</Button>
            </div>
          </div>
        ) : <p className="px-4 py-4 text-sm text-muted-foreground">A replacement becomes available when an active number is assigned.</p>}
      </Surface></section></ItemGroup>

      {chooserOpen && !replacementUsed ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="replacement-heading">
          <div className="max-w-2xl">
            <h2 id="replacement-heading" className="flex items-center gap-2 text-base font-semibold text-slate-900"><MapPin className="size-5 text-teal-700" />Choose a replacement</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Search available voice-and-SMS numbers. Inventory offers expire after five minutes.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <select aria-label="Country" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="CA">Canada</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="AU">Australia</option></select>
            <select aria-label="Number type" value={kind} onChange={(event) => setKind(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="local">Local</option><option value="toll_free">Toll-free</option></select>
            <input aria-label="Area code" value={areaCode} onChange={(event) => setAreaCode(event.target.value.replace(/\D/g, ""))} placeholder="Area code" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" disabled={kind === "toll_free"} />
            <input aria-label="City" value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" disabled={kind === "toll_free"} />
            <Button disabled={!business || search.isPending || replacementPending} onClick={() => search.mutate()}><RefreshCw className="size-4" />{search.isPending ? "Searching..." : "Search"}</Button>
          </div>
          {search.isError || claim.isError || claimStatus.isError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{(claim.error ?? search.error ?? claimStatus.error)?.message}</p> : null}
          {terminalClaim ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{terminalClaim.lastError ?? "The replacement could not be completed. Search again to choose another number."}</p> : null}
          {replacementPending ? <p className="mt-5 text-sm font-medium text-teal-800">Connecting {claimStatus.data?.claim?.requestedE164 ?? "your new number"}...</p> : null}
          {!replacementPending && offers.length ? <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">{offers.map((offer) => <div key={offer.phoneE164} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{offer.phoneE164}</p><p className="mt-1 text-sm text-slate-500">{[offer.locality, offer.region, offer.countryCode].filter(Boolean).join(", ")}</p></div><Button disabled={claim.isPending} onClick={() => claim.mutate(offer.claimToken)}>Use this number</Button></div>)}</div> : null}
          {!replacementPending && search.isSuccess && !offers.length ? <p className="mt-5 text-sm text-slate-500">No matching numbers are currently available. Try a broader search.</p> : null}
        </section>
      ) : null}
    </PageSurface>
  );
}
