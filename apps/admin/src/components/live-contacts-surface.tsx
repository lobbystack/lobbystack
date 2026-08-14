"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@web/components/page-header";
import { TableCardSkeleton } from "@web/components/loading-skeletons";
import { Badge } from "@web/components/ui/badge";
import { Input } from "@web/components/ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@web/components/ui/table";
import { formatDateTime } from "@/lib/locale";

type Business = { businessId: string; active: boolean };
type Contact = { id: string; name: string | null; phone: string; email: string | null; smsConsentStatus: string | null; operatorBlockedAt: string | null; createdAt: string; updatedAt: string };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load contacts.");
  return await response.json() as T;
}

export function LiveContactsSurface() {
  const { i18n, t } = useTranslation("contacts");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const contacts = useQuery({ queryKey: ["contacts", business?.businessId], queryFn: () => getJson<{ contacts: Contact[] }>("/api/contacts"), enabled: Boolean(business) });

  useEffect(() => {
    if (!business) return;
    const source = new EventSource("/api/realtime");
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["contacts", business.businessId] });
    for (const event of ["call.completed", "message.upserted", "conversation.updated"]) source.addEventListener(event, refresh);
    return () => source.close();
  }, [business, queryClient]);

  const rows = useMemo(() => (contacts.data?.contacts ?? []).filter((contact) => [contact.name, contact.phone, contact.email].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase())), [contacts.data, search]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title={t("page.title")} />
      <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" onChange={(event) => setSearch(event.target.value)} placeholder={t("page.searchPlaceholder")} value={search} /></div>
      {businesses.isLoading || contacts.isLoading ? <TableCardSkeleton columns={5} /> : (
        <TableCard>
          <Table className="min-w-[50rem]">
            <TableHeader><TableRow><TableHead>{t("table.contact")}</TableHead><TableHead>{t("detail.metadata.phone")}</TableHead><TableHead>{t("detail.metadata.email")}</TableHead><TableHead>{t("table.activity")}</TableHead><TableHead className="text-right">{t("table.lastInteraction")}</TableHead></TableRow></TableHeader>
            <TableBody>{rows.length ? rows.map((contact) => <TableRow key={contact.id}><TableCell className="font-medium"><Link className="hover:underline" href={`/contacts/${contact.id}`}>{contact.name ?? t("table.unknownContact")}</Link></TableCell><TableCell>{contact.phone}</TableCell><TableCell>{contact.email ?? "-"}</TableCell><TableCell><Badge variant={contact.operatorBlockedAt ? "destructive" : "secondary"}>{contact.operatorBlockedAt ? t("detail.blocking.badge") : t("detail.blocking.active")}</Badge></TableCell><TableCell className="text-right">{formatDateTime(contact.updatedAt ?? contact.createdAt, i18n.language, { dateStyle: "medium" })}</TableCell></TableRow>) : <TableRow><TableCell className="h-32 text-center text-muted-foreground" colSpan={5}>{t("table.empty")}</TableCell></TableRow>}</TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
