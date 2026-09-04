"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { PhoneNumberViewModel, WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type NumberOffer = { phoneE164: string; locality?: string; region?: string; countryCode: string; claimToken: string };
type Claim = { status: string; requestedE164: string; lastError: string | null } | null;
type NumbersResponse = { phoneNumbers: PhoneNumberViewModel[]; replacement: { reservedAt: string | null; usedAt: string | null; activeClaim: { id: string; status: string } | null } };

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return value;
}

export function LivePhoneNumberSettingsSurface() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [countryCode, setCountryCode] = useState("CA");
  const [areaCode, setAreaCode] = useState("");
  const [offers, setOffers] = useState<NumberOffer[]>([]);
  const [claimId, setClaimId] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const numbers = useQuery({ queryKey: ["phone-numbers", business?.businessId], queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const primary = numbers.data?.phoneNumbers[0] ?? null;
  const replacementUsed = Boolean(numbers.data?.replacement.usedAt);

  useEffect(() => { const activeClaim = numbers.data?.replacement.activeClaim; if (activeClaim) { setClaimId(activeClaim.id); setDialogOpen(true); } }, [numbers.data?.replacement.activeClaim]);
  const search = useMutation({ mutationFn: () => requestJson<{ numbers: NumberOffer[] }>(`/api/phone-numbers/replacement/search?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ selection: { countryCode, kind: "local", ...(areaCode ? { areaCode } : {}) }, limit: 12 }) }), onSuccess: (result) => setOffers(result.numbers) });
  const claim = useMutation({ mutationFn: (claimToken: string) => requestJson<{ claimId: string }>(`/api/phone-numbers/replacement/claim?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ claimToken, idempotencyKey: crypto.randomUUID() }) }), onSuccess: (result) => setClaimId(result.claimId) });
  const claimStatus = useQuery({ queryKey: ["replacement-claim", business?.businessId, claimId], queryFn: () => requestJson<{ claim: Claim }>(`/api/phone-numbers/replacement/claim/${claimId}?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business && claimId), refetchInterval: (query) => ["reserved", "provisioning"].includes(query.state.data?.claim?.status ?? "") ? 1000 : false });
  useEffect(() => { if (claimStatus.data?.claim?.status === "claimed") { void queryClient.invalidateQueries({ queryKey: ["phone-numbers", business?.businessId] }); setDialogOpen(false); setClaimId(null); setOffers([]); toast.success(t(primary ? "phoneNumber.toast.changed" : "phoneNumber.toast.added")); } }, [business?.businessId, claimStatus.data?.claim?.status, primary, queryClient, t]);
  const pending = claim.isPending || ["reserved", "provisioning"].includes(claimStatus.data?.claim?.status ?? "");

  return <div className="flex flex-1 flex-col"><div className="w-full space-y-4"><ItemGroup spacing="section"><Item variant="outline"><ItemContent><ItemTitle>{t("phoneNumber.current.label")}</ItemTitle><ItemDescription>{t("phoneNumber.current.description")}</ItemDescription>{numbers.isLoading || businesses.isLoading ? <Skeleton className="h-6 w-48 max-w-full" /> : primary ? <p className="text-[15px] leading-6 text-foreground">{formatPhoneNumber(primary.e164)}</p> : <p className="text-[15px] leading-6 text-muted-foreground">{t("phoneNumber.current.empty")}</p>}</ItemContent>{canManage ? <ItemActions><Dialog onOpenChange={setDialogOpen} open={dialogOpen}><DialogTrigger render={<Button disabled={numbers.isLoading || replacementUsed} size="sm" variant="outline" />}>{t(primary ? "phoneNumber.actions.requestChange" : "phoneNumber.actions.getNumber")}</DialogTrigger><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{t(primary ? "phoneNumber.dialog.title" : "phoneNumber.dialog.getNumberTitle")}</DialogTitle><DialogDescription>{t(primary ? "phoneNumber.dialog.description" : "phoneNumber.dialog.getNumberDescription")}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Select onValueChange={(value) => value && setCountryCode(value)} value={countryCode}><SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CA">Canada</SelectItem><SelectItem value="US">United States</SelectItem></SelectContent></Select><Input aria-label={t("phoneNumber.picker.areaCodeLabel")} className="h-11" onChange={(event) => setAreaCode(event.target.value.replace(/\D/g, ""))} placeholder={t("phoneNumber.picker.areaCodePlaceholder")} value={areaCode} /><Button className="h-11" disabled={search.isPending || pending} onClick={() => search.mutate()}><RefreshCw className={search.isPending ? "size-4 animate-spin" : "size-4"} />{t("phoneNumber.picker.search")}</Button></div>{pending ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("phoneNumber.picker.claiming")}</div> : null}{offers.length ? <TableCard><Table><TableHeader><TableRow><TableHead>{t("phoneNumber.picker.phoneNumberHeader")}</TableHead><TableHead>Location</TableHead><TableHead className="text-right"><span className="sr-only">{t("phoneNumber.picker.select")}</span></TableHead></TableRow></TableHeader><TableBody>{offers.map((offer) => <TableRow key={offer.phoneE164}><TableCell className="font-medium">{formatPhoneNumber(offer.phoneE164)}</TableCell><TableCell className="text-muted-foreground">{[offer.locality, offer.region, offer.countryCode].filter(Boolean).join(", ")}</TableCell><TableCell className="text-right"><Button disabled={pending} onClick={() => claim.mutate(offer.claimToken)} size="sm">{t("phoneNumber.picker.select")}</Button></TableCell></TableRow>)}</TableBody></Table></TableCard> : null}{search.isSuccess && offers.length === 0 ? <p className="py-5 text-sm text-muted-foreground">{t("phoneNumber.picker.empty")}</p> : null}{search.isError || claim.isError || claimStatus.isError ? <FieldError>{(search.error ?? claim.error ?? claimStatus.error)?.message}</FieldError> : null}</DialogContent></Dialog></ItemActions> : null}</Item></ItemGroup></div></div>;
}
