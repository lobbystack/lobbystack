"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PARTNER_PACKAGE_ALLOWANCE_MAX, PARTNER_PACKAGE_NAME_MAX_LENGTH, formatPriceAmount, intlLocale, type PartnerRole, type PartnerStripeStatus } from "@lobbystack/shared";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
import { useConsolePartner } from "@/components/partner-shell";
import { useTelemetry } from "@/components/product-analytics";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parsePriceInput } from "@/lib/price-input";
import { requestJson } from "@/lib/request-json";
import { Status } from "@/components/ui/status";
import { PACKAGE_STATUS_VARIANTS } from "@/lib/status-variants";
import { EmptyState } from "@/components/ui/empty-state";

/** A package as GET /api/partner/packages lists it. Amounts are in the currency's smallest unit. */
type PartnerPackage = {
  packageId: string;
  name: string;
  currency: string;
  monthlyPriceMinor: number;
  setupFeeMinor: number | null;
  allowance: { voiceMinutes: number; chats: number };
  onConnectedAccount: boolean;
  createdAt: string;
};
type Packages = { role: PartnerRole; stripe: { configured: boolean; status: PartnerStripeStatus; currency: string | null }; packages: PartnerPackage[] };

type Draft = { name: string; price: string; setupFee: string; minutes: string; chats: string };
const EMPTY_DRAFT: Draft = { name: "", price: "", setupFee: "", minutes: "", chats: "" };

const CREATE_ERRORS: Record<string, string> = {
  invalid_name: "packages.create.errors.invalidName",
  invalid_price: "packages.create.errors.invalidPrice",
  invalid_amount: "packages.create.errors.invalidPrice",
  invalid_setup_fee: "packages.create.errors.invalidSetupFee",
  invalid_allowance: "packages.create.errors.invalidAllowance",
  stripe_not_connected: "packages.create.errors.notConnected",
  stripe_not_configured: "packages.notConfigured",
};

// Digits, grouped by thousands the way any of the dashboard's languages writes them: 1,000, 1.000 or 1 000.
const WHOLE_NUMBER = /^\d{1,7}$|^\d{1,3}(?:[.,\s\u00a0\u202f]\d{3}){1,2}$/u;

/** A whole number of minutes or chats from 0 to 1,000,000, or undefined when the text isn't one, as 2.5 isn't. */
function readAllowance(text: string): number | undefined {
  const trimmed = text.trim();
  if (!WHOLE_NUMBER.test(trimmed)) return undefined;
  const value = Number(trimmed.replace(/\D/gu, ""));
  return value <= PARTNER_PACKAGE_ALLOWANCE_MAX ? value : undefined;
}

/**
 * The console's Packages page, for owners and admins. A package is what the
 * partner sells its businesses: a monthly price, an optional setup fee and an
 * allowance of minutes and chats, in its Stripe account's currency. Its
 * price and allowance are fixed once it's made, since businesses may already
 * pay them; it can be renamed or taken off sale. The server enforces the same.
 */
export function PartnerPackagesSurface() {
  const { t, i18n } = useTranslation("partner");
  const partner = useConsolePartner();
  const telemetry = useTelemetry();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const locale = intlLocale(i18n.language);
  const canManage = partner.role !== "member";
  const queryKey = ["partner-packages", partner.partnerId];
  const packages = useQuery({ queryKey, queryFn: () => requestJson<Packages>(`/api/partner/packages?partnerId=${encodeURIComponent(partner.partnerId)}`), enabled: canManage });

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const [renameSubmitted, setRenameSubmitted] = useState(false);
  const [renaming, setRenaming] = useState<PartnerPackage | null>(null);
  const [newName, setNewName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const createNameError = createSubmitted && !draft.name.trim() ? t("packages.create.nameRequired") : null;
  const createPriceError = createSubmitted && !draft.price.trim() ? t("packages.create.priceRequired") : null;
  const renameNameError = renameSubmitted && !newName.trim() ? t("packages.rename.nameRequired") : null;
  const [archiving, setArchiving] = useState<PartnerPackage | null>(null);

  const currency = packages.data?.stripe.currency ?? null;
  const formatAmount = (amountMinor: number, code: string) => formatPriceAmount(amountMinor, code, locale);
  const formatCount = (value: number) => new Intl.NumberFormat(locale).format(value);
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const invalidate = async () => await queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: async () => {
      const price = parsePriceInput(draft.price, currency!, i18n.language);
      const setupFee = parsePriceInput(draft.setupFee, currency!, i18n.language);
      const minutes = readAllowance(draft.minutes);
      const chats = readAllowance(draft.chats);
      if (price.kind !== "amount" || price.minor === 0) throw Object.assign(new Error("invalid price"), { code: "invalid_price" });
      if (setupFee.kind === "invalid") throw Object.assign(new Error("invalid setup fee"), { code: "invalid_setup_fee" });
      if (minutes === undefined || chats === undefined) throw Object.assign(new Error("invalid allowance"), { code: "invalid_allowance" });
      return await requestJson<PartnerPackage>("/api/partner/packages", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, name: draft.name.trim(), monthlyPriceMinor: price.minor, setupFeeMinor: setupFee.kind === "amount" ? setupFee.minor : null, voiceMinutes: minutes, chats }) });
    },
    onSuccess: async (created) => {
      telemetry.track("web.partner.package_created", { partnerId: partner.partnerId, packageId: created.packageId, currency: created.currency, setupFee: created.setupFeeMinor !== null, pathname: pathname ?? "/partner" });
      await invalidate();
      toast.success(t("packages.create.created", { name: created.name }));
      setDraft(EMPTY_DRAFT);
      setCreateOpen(false);
    },
    onError: (cause: Error & { code?: string }) => setCreateError(t(CREATE_ERRORS[cause.code ?? ""] ?? "packages.create.errors.failed")),
  });

  const rename = useMutation({
    mutationFn: (target: PartnerPackage) => requestJson<PartnerPackage>("/api/partner/packages", { method: "PATCH", body: JSON.stringify({ partnerId: partner.partnerId, packageId: target.packageId, name: newName.trim() }) }),
    onSuccess: async () => {
      await invalidate();
      toast.success(t("packages.rename.saved"));
      setRenaming(null);
    },
    onError: (cause: Error & { code?: string }) => setRenameError(t(cause.code === "invalid_name" ? "packages.create.errors.invalidName" : cause.code === "stripe_not_connected" ? "packages.rename.notConnected" : "packages.rename.failed")),
  });

  const archive = useMutation({
    mutationFn: (target: PartnerPackage) => requestJson("/api/partner/packages", { method: "DELETE", body: JSON.stringify({ partnerId: partner.partnerId, packageId: target.packageId }) }),
    onSuccess: async (_result, target) => {
      await invalidate();
      toast.success(t("packages.archive.done", { name: target.name }));
    },
    onError: () => toast.error(t("packages.archive.failed")),
  });

  const header = (actions?: React.ReactNode) => (
    <PageHeader actions={actions} title={t("packages.title")} />
  );
  const message = (text: string) => <Surface className="px-6 py-8"><p className="type-body-muted" role="alert">{text}</p></Surface>;
  if (!canManage) return <div className="flex flex-col gap-6">{header()}{message(t("packages.managersOnly"))}</div>;
  const data = packages.data;
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        {header()}
        {packages.isError ? message(t("packages.loadFailed")) : <Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></Surface>}
      </div>
    );
  }

  const isOwner = data.role === "owner";
  const stripePage = `/partner/${partner.partnerId}/payments`;
  const notice = !data.stripe.configured
    ? { text: t("packages.notConfigured"), link: false }
    : data.stripe.status === "disconnected"
      ? { text: t(isOwner ? "packages.disconnected.owner" : "packages.disconnected.admin"), link: isOwner }
      : !currency
        ? { text: t(isOwner ? "packages.connectFirst.owner" : "packages.connectFirst.admin"), link: isOwner }
        : data.stripe.status !== "active"
          ? { text: t("packages.notReady"), link: isOwner }
          : null;

  const createDialog = currency ? (
    <Dialog onOpenChange={(next) => { setCreateOpen(next); if (!next) { setDraft(EMPTY_DRAFT); setCreateError(null); setCreateSubmitted(false); } }} open={createOpen}>
      <DialogTrigger render={<Button size="sm" />}>{t("packages.create.action")}</DialogTrigger>
      <DialogContent size="sm">
        <form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setCreateSubmitted(true); if (!create.isPending && draft.name.trim() && draft.price.trim()) { setCreateError(null); create.mutate(); } }}>
          <DialogHeader>
            <DialogTitle>{t("packages.create.title")}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={createNameError ? true : undefined}>
              <FieldLabel htmlFor="partner-package-name">{t("packages.create.nameLabel")}</FieldLabel>
              <Input aria-describedby={createNameError ? "partner-package-name-error" : undefined} aria-invalid={createNameError ? true : undefined} autoComplete="off" id="partner-package-name" maxLength={PARTNER_PACKAGE_NAME_MAX_LENGTH} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={t("packages.create.namePlaceholder")} value={draft.name} />
              {createNameError ? <FieldError id="partner-package-name-error">{createNameError}</FieldError> : null}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={createPriceError ? true : undefined}>
                <FieldLabel htmlFor="partner-package-price">{t("packages.create.priceLabel")}</FieldLabel>
                <InputGroup>
                  <InputGroupInput aria-describedby={createPriceError ? "partner-package-price-error" : undefined} aria-invalid={createPriceError ? true : undefined} className="tabular-nums" id="partner-package-price" inputMode="decimal" onChange={(event) => setDraft({ ...draft, price: event.target.value })} value={draft.price} />
                  <InputGroupAddon align="inline-end"><InputGroupText>{currency}</InputGroupText></InputGroupAddon>
                </InputGroup>
                {createPriceError ? <FieldError id="partner-package-price-error">{createPriceError}</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="partner-package-setup-fee">{t("packages.create.setupFeeLabel")}</FieldLabel>
                <InputGroup>
                  <InputGroupInput className="tabular-nums" id="partner-package-setup-fee" inputMode="decimal" onChange={(event) => setDraft({ ...draft, setupFee: event.target.value })} placeholder={t("packages.create.optional")} value={draft.setupFee} />
                  <InputGroupAddon align="inline-end"><InputGroupText>{currency}</InputGroupText></InputGroupAddon>
                </InputGroup>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="partner-package-minutes">{t("packages.create.minutesLabel")}</FieldLabel>
                <Input className="tabular-nums" id="partner-package-minutes" inputMode="numeric" onChange={(event) => setDraft({ ...draft, minutes: event.target.value })} placeholder="300" value={draft.minutes} />
              </Field>
              <Field>
                <FieldLabel htmlFor="partner-package-chats">{t("packages.create.chatsLabel")}</FieldLabel>
                <Input className="tabular-nums" id="partner-package-chats" inputMode="numeric" onChange={(event) => setDraft({ ...draft, chats: event.target.value })} placeholder="1000" value={draft.chats} />
              </Field>
            </div>
            <FieldDescription>{t("packages.create.fixedTerms")}</FieldDescription>
          </FieldGroup>
          {createError ? <p className="type-body text-destructive" role="alert">{createError}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button disabled={create.isPending} type="button" variant="outline" />}>{t("packages.create.cancel")}</DialogClose>
            <Button disabled={create.isPending} loading={create.isPending} loadingLabel={t("packages.create.submitting")} type="submit">{t("packages.create.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {header(createDialog)}
      {notice ? (
        <Surface className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-body-muted">{notice.text}</p>
          {notice.link ? <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={stripePage}>{t("packages.openStripe")}</Link> : null}
        </Surface>
      ) : null}
      {data.packages.length === 0 ? (
        <EmptyState description={data.stripe.configured ? undefined : t("packages.empty.noStripe")} title={t("packages.empty.title")} />
      ) : (
        <Surface className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("packages.table.package")}</TableHead>
                <TableHead>{t("packages.table.price")}</TableHead>
                <TableHead>{t("packages.table.allowance")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.packages.map((item) => (
                <TableRow key={item.packageId}>
                  <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="type-title">{item.name}</p>
                        {item.onConnectedAccount ? null : <Status variant={PACKAGE_STATUS_VARIANTS.oldAccount}>{t("packages.oldAccount")}</Status>}
                      </div>
                      <p className="type-body-muted">{t("packages.createdOn", { date: formatDate(item.createdAt) })}</p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-col gap-1 tabular-nums">
                      <p className="type-body">{t("packages.perMonth", { amount: formatAmount(item.monthlyPriceMinor, item.currency) })}</p>
                      <p className="type-body-muted">{item.setupFeeMinor === null ? t("packages.noSetupFee") : t("packages.setupFee", { amount: formatAmount(item.setupFeeMinor, item.currency) })}</p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-col gap-1 tabular-nums">
                      <p className="type-body">{t("packages.minutes", { count: item.allowance.voiceMinutes, amount: formatCount(item.allowance.voiceMinutes) })}</p>
                      <p className="type-body">{t("packages.chats", { count: item.allowance.chats, amount: formatCount(item.allowance.chats) })}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button aria-label={t("packages.moreOptions", { name: item.name })} disabled={rename.isPending || archive.isPending} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} />
                      <DropdownMenuContent align="end">
                        {item.onConnectedAccount ? <>
                          <DropdownMenuItem onClick={() => { setRenaming(item); setNewName(item.name); setRenameError(null); }}><Pencil />{t("packages.rename.action")}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </> : null}
                        <DropdownMenuItem onClick={() => setArchiving(item)} variant="destructive"><Trash2 />{t("packages.archive.action")}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
      <Dialog onOpenChange={(next) => { if (!next) { setRenaming(null); setRenameSubmitted(false); } }} open={renaming !== null}>
        <DialogContent size="sm">
          <form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setRenameSubmitted(true); if (renaming && !rename.isPending && newName.trim()) { setRenameError(null); rename.mutate(renaming); } }}>
            <DialogHeader>
              <DialogTitle>{t("packages.rename.title")}</DialogTitle>
            </DialogHeader>
            <Field data-invalid={renameNameError ? true : undefined}>
              <FieldLabel htmlFor="partner-package-rename">{t("packages.create.nameLabel")}</FieldLabel>
              <Input aria-describedby={renameNameError ? "partner-package-rename-error" : undefined} aria-invalid={renameNameError ? true : undefined} autoComplete="off" id="partner-package-rename" maxLength={PARTNER_PACKAGE_NAME_MAX_LENGTH} onChange={(event) => setNewName(event.target.value)} value={newName} />
              {renameNameError ? <FieldError id="partner-package-rename-error">{renameNameError}</FieldError> : null}
            </Field>
            {renameError ? <p className="type-body text-destructive" role="alert">{renameError}</p> : null}
            <DialogFooter>
              <DialogClose render={<Button disabled={rename.isPending} type="button" variant="outline" />}>{t("packages.rename.cancel")}</DialogClose>
              <Button disabled={rename.isPending} loading={rename.isPending} loadingLabel={t("packages.rename.saving")} type="submit">{t("packages.rename.submit")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        cancelLabel={t("packages.archive.cancel")}
        confirmLabel={t("packages.archive.confirm")}
        confirmVariant="destructive"
        description={t("packages.archive.description")}
        onConfirm={async () => { if (archiving) await archive.mutateAsync(archiving); }}
        onOpenChange={(next) => { if (!next) setArchiving(null); }}
        open={archiving !== null}
        pending={archive.isPending}
        title={t("packages.archive.title", { name: archiving?.name ?? "" })}
      />
    </div>
  );
}
