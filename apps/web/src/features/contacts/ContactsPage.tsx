import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/locale";

type ContactsPageProps = {
  businessId?: Id<"businesses">;
};

type ContactRow = {
  id: Id<"contacts">;
  name: string | null;
  phone: string;
  email: string | null;
  messageCount: number;
  callCount: number;
  appointmentCount: number;
  lastInteractionAt: number;
};

export function ContactsPage({ businessId }: ContactsPageProps) {
  const { i18n, t } = useTranslation("contacts");
  const contacts = useQuery(
    api.dashboard.contacts.listContacts,
    businessId ? { businessId } : "skip",
  ) as Array<ContactRow> | undefined;
  const [searchValue, setSearchValue] = useState("");

  const rows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return (contacts ?? []).filter((contact: ContactRow) => {
      const haystack = [contact.name, contact.phone, contact.email].filter(Boolean).join(" ").toLowerCase();
      return query.length === 0 || haystack.includes(query);
    });
  }, [contacts, searchValue]);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader description={t("page.description")} title={t("page.title")} />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={t("page.searchPlaceholder")}
          value={searchValue}
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.contact")}</TableHead>
              <TableHead>{t("table.channels")}</TableHead>
              <TableHead>{t("table.activity")}</TableHead>
              <TableHead>{t("table.appointments")}</TableHead>
              <TableHead>{t("table.lastInteraction")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((contact: ContactRow) => (
              <TableRow key={String(contact.id)}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">{contact.name ?? t("table.unknownContact")}</span>
                    <span className="text-xs text-muted-foreground">{contact.phone}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{contact.phone}</Badge>
                    {contact.email ? <Badge variant="outline">{contact.email}</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="secondary">{t("table.messages", { count: contact.messageCount })}</Badge>
                    <Badge variant="secondary">{t("table.calls", { count: contact.callCount })}</Badge>
                  </div>
                </TableCell>
                <TableCell>{contact.appointmentCount}</TableCell>
                <TableCell>
                  {formatDateTime(contact.lastInteractionAt, i18n.language, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                  {t("table.empty")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
