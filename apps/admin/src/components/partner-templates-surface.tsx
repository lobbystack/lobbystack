"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { BusinessTemplate } from "@lobbystack/shared";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
import { useConsolePartner } from "@/components/partner-shell";
import { useTelemetry } from "@/components/product-analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

/** A template as the console lists it. */
export type PartnerTemplate = { templateId: string; name: string; createdAt: string; template: BusinessTemplate };

/** The partner's templates, which the Templates page lists and the Create business dialog offers. */
export function partnerTemplatesQueryKey(partnerId: string) {
  return ["partner-templates", partnerId] as const;
}

export async function fetchPartnerTemplates(partnerId: string): Promise<PartnerTemplate[]> {
  // An answer without a list, such as a page that's gone, offers no templates.
  return (await requestJson<{ templates?: PartnerTemplate[] }>(`/api/partner/templates?partnerId=${encodeURIComponent(partnerId)}`)).templates ?? [];
}

const TEMPLATE_NAME_MAX_LENGTH = 120;

/** What a template sets up, one badge per part. */
function TemplateContents({ template }: { template: BusinessTemplate }) {
  const { t } = useTranslation("partner");
  const counts = [
    ["services", template.services?.length ?? 0],
    ["rules", template.rules?.length ?? 0],
    ["websites", template.knowledge?.websites?.length ?? 0],
    ["files", template.knowledge?.files?.length ?? 0],
    ["faqs", template.knowledge?.faqs?.length ?? 0],
    ["texts", template.knowledge?.texts?.length ?? 0],
  ] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {template.receptionist ? <Badge variant="secondary">{t("templates.contents.receptionist")}</Badge> : null}
      {template.business.hours?.length ? <Badge variant="secondary">{t("templates.contents.hours")}</Badge> : null}
      {counts.filter(([, count]) => count > 0).map(([part, count]) => <Badge key={part} variant="secondary">{t(`templates.contents.${part}`, { count })}</Badge>)}
    </div>
  );
}

type SaveTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The business to save, from its row on the Businesses page. Without one, the dialog asks which. */
  business?: { businessId: string; name: string } | undefined;
};

/**
 * Saves one of the partner's businesses as a template under a name. The
 * server copies its setup and documents, and checks that the person is an
 * owner or admin.
 */
export function SaveTemplateDialog({ open, onOpenChange, business }: SaveTemplateDialogProps) {
  const { t } = useTranslation("partner");
  const partner = useConsolePartner();
  const telemetry = useTelemetry();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [businessId, setBusinessId] = useState<string | null>(business?.businessId ?? null);
  const [name, setName] = useState(business?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setBusinessId(business?.businessId ?? null);
    setName(business?.name ?? "");
    setError(null);
  }, [open, business?.businessId, business?.name]);
  const businesses = useQuery({
    queryKey: ["partner-businesses", partner.partnerId],
    queryFn: () => requestJson<{ businesses: Array<{ businessId: string; name: string }> }>(`/api/partner/businesses?partnerId=${encodeURIComponent(partner.partnerId)}`),
    enabled: open && !business,
  });
  const options = (businesses.data?.businesses ?? []).map((row) => ({ value: row.businessId, label: row.name }));

  const save = useMutation({
    mutationFn: () => requestJson<PartnerTemplate>("/api/partner/templates", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, businessId, name: name.trim() }) }),
    onSuccess: async (saved) => {
      telemetry.track("web.partner.template_saved", { partnerId: partner.partnerId, templateId: saved.templateId, businessId: businessId ?? "", pathname: pathname ?? "/partner" });
      await queryClient.invalidateQueries({ queryKey: partnerTemplatesQueryKey(partner.partnerId) });
      toast.success(t("templates.save.saved", { name: saved.name }));
      onOpenChange(false);
    },
    onError: (cause: Error & { code?: string }) => {
      const messages: Record<string, string> = {
        invalid_name: "templates.save.errors.invalidName",
        template_invalid: "templates.save.errors.invalid",
        template_file_mismatch: "templates.save.errors.fileMismatch",
        rate_limited: "templates.save.errors.rateLimited",
      };
      setError(t(messages[cause.code ?? ""] ?? "templates.save.errors.failed"));
    },
  });
  const ready = Boolean(businessId && name.trim()) && !save.isPending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (ready) { setError(null); save.mutate(); } }}>
          <DialogHeader>
            <DialogTitle>{t("templates.save.title")}</DialogTitle>
            <DialogDescription>{t("templates.save.description")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {business ? null : (
              <Field>
                <FieldLabel htmlFor="partner-template-business">{t("templates.save.businessLabel")}</FieldLabel>
                {businesses.isSuccess && !options.length ? <p className="text-sm text-muted-foreground">{t("templates.save.noBusinesses")}</p> : (
                  <Select disabled={!businesses.isSuccess} items={options} onValueChange={(value) => { if (typeof value === "string") { setBusinessId(value); if (!name.trim()) setName(options.find((option) => option.value === value)?.label ?? ""); } }} value={businessId}>
                    <SelectTrigger aria-label={t("templates.save.businessLabel")} className="w-full" id="partner-template-business" loading={businesses.isLoading}><SelectValue placeholder={t("templates.save.businessPlaceholder")} /></SelectTrigger>
                    <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                )}
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="partner-template-name">{t("templates.save.nameLabel")}</FieldLabel>
              <Input autoComplete="off" id="partner-template-name" maxLength={TEMPLATE_NAME_MAX_LENGTH} onChange={(event) => setName(event.target.value)} placeholder={t("templates.save.namePlaceholder")} value={name} />
            </Field>
          </FieldGroup>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button disabled={!ready} loading={save.isPending} loadingLabel={t("templates.save.submitting")} type="submit">{t("templates.save.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The console's Templates page. Everyone on the team sees the partner's
 * templates and what each sets up. Owners and admins save a business's setup
 * as one, which the Create business dialog then offers, and delete them. The
 * server enforces the same rules.
 */
export function PartnerTemplatesSurface() {
  const { t, i18n } = useTranslation("partner");
  const partner = useConsolePartner();
  const telemetry = useTelemetry();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const queryKey = partnerTemplatesQueryKey(partner.partnerId);
  const templates = useQuery({ queryKey, queryFn: () => fetchPartnerTemplates(partner.partnerId) });
  const canManage = partner.role === "owner" || partner.role === "admin";
  const locale = intlLocale(i18n.language);
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<PartnerTemplate | null>(null);
  const remove = useMutation({
    mutationFn: (template: PartnerTemplate) => requestJson("/api/partner/templates", { method: "DELETE", body: JSON.stringify({ partnerId: partner.partnerId, templateId: template.templateId }) }),
    onSuccess: async (_result, template) => {
      telemetry.track("web.partner.template_deleted", { partnerId: partner.partnerId, templateId: template.templateId, pathname: pathname ?? "/partner" });
      toast.success(t("templates.delete.deleted", { name: template.name }));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (_cause, template) => { toast.error(t("templates.delete.failed", { name: template.name })); },
  });

  const rows = templates.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader actions={canManage ? <Button disabled={templates.isLoading} onClick={() => setSaving(true)} size="sm">{t("templates.save.action")}</Button> : undefined} title={t("templates.title")} />
      {templates.isLoading ? (
        <Surface className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></Surface>
      ) : templates.isError ? (
        <Surface className="px-6 py-8"><p className="text-sm text-muted-foreground" role="alert">{t("templates.loadFailed")}</p></Surface>
      ) : rows.length === 0 ? (
        <Surface className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <h2 className="text-base font-medium">{t("templates.empty.title")}</h2>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t(canManage ? "templates.empty.description" : "templates.empty.memberDescription")}</p>
        </Surface>
      ) : (
        <Surface className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("templates.table.template")}</TableHead>
                <TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("templates.table.contents")}</TableHead>
                {canManage ? <TableHead className="h-12 px-6"><span className="sr-only">{t("templates.table.actions")}</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((template) => (
                <TableRow className="hover:bg-transparent" key={template.templateId}>
                  <TableCell className="px-6 py-5 whitespace-normal [overflow-wrap:anywhere]">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-sm text-muted-foreground">{t("templates.savedOn", { date: formatDate(template.createdAt) })}</p>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5 whitespace-normal"><TemplateContents template={template.template} /></TableCell>
                  {canManage ? (
                    <TableCell className="px-6 py-5">
                      <div className="flex items-center justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button aria-label={t("templates.actions.more", { name: template.name })} disabled={remove.isPending} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDeleting(template)} variant="destructive"><Trash2 />{t("templates.delete.action")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
      {canManage ? <SaveTemplateDialog onOpenChange={setSaving} open={saving} /> : null}
      {deleting ? (
        <ConfirmActionDialog
          cancelLabel={t("businesses.confirm.cancel")}
          confirmLabel={t("templates.delete.confirm")}
          confirmVariant="destructive"
          description={t("templates.delete.description", { name: deleting.name })}
          onConfirm={async () => { await remove.mutateAsync(deleting); }}
          onOpenChange={(next) => { if (!next) setDeleting(null); }}
          open
          pending={remove.isPending}
          title={t("templates.delete.title", { name: deleting.name })}
        />
      ) : null}
    </div>
  );
}
