"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { apiKeyScopes, type ApiKeyScope } from "@lobbystack/shared";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { SecretReveal } from "@/components/secret-reveal";
import { SectionBlock } from "@/components/section-block";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { selectActiveBusiness } from "@/lib/active-business";
import type { WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";

type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  createdBy: { userId: string; name: string | null; email: string | null } | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const scopeKey = (scope: ApiKeyScope) => scope.replace(":", "_");

export function LiveApiKeysSurface() {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["calls:read", "contacts:read", "appointments:read", "messages:read", "business:read"]);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRecord | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const keys = useQuery({ queryKey: ["api-keys", business?.businessId], queryFn: () => requestJson<{ keys: ApiKeyRecord[] }>(`/api/api-keys?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId && canManage) });
  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }).format(new Date(value));

  const create = useMutation({
    mutationFn: () => requestJson<{ key: string; apiKey: ApiKeyRecord }>(`/api/api-keys?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ name: name.trim(), scopes }) }),
    onSuccess: async (result) => {
      setCreated({ key: result.key, name: result.apiKey.name });
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["api-keys", business?.businessId] });
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: (key: ApiKeyRecord) => requestJson(`/api/api-keys/${encodeURIComponent(key.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }),
    onSuccess: async () => { toast.success(t("apiKeys.revoke.done")); await queryClient.invalidateQueries({ queryKey: ["api-keys", business?.businessId] }); },
    onError: () => toast.error(t("apiKeys.revoke.failed")),
  });

  function closeCreate(open: boolean) {
    setCreateOpen(open);
    if (!open) setCreated(null);
  }

  if (businesses.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!canManage) return <Alert><AlertTitle>{t("apiKeys.restricted.title")}</AlertTitle><AlertDescription>{t("apiKeys.restricted.description")}</AlertDescription></Alert>;

  const rows = keys.data?.keys ?? [];
  return (
    <>
      <SectionBlock
        action={<Button onClick={() => setCreateOpen(true)} size="sm"><KeyRound data-icon="inline-start" />{t("apiKeys.create.action")}</Button>}
        description={t("apiKeys.description")}
        title={t("apiKeys.title")}
      >
        <Surface>
          {keys.isLoading ? <div className="p-6"><Skeleton className="h-24 w-full rounded-xl" /></div> : rows.length === 0 ? (
            <p className="type-body-muted p-6 text-center">{t("apiKeys.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6">{t("apiKeys.columns.name")}</TableHead>
                    <TableHead>{t("apiKeys.columns.key")}</TableHead>
                    <TableHead>{t("apiKeys.columns.scopes")}</TableHead>
                    <TableHead>{t("apiKeys.columns.created")}</TableHead>
                    <TableHead>{t("apiKeys.columns.lastUsed")}</TableHead>
                    <TableHead className="px-6 text-right"><span className="sr-only">{t("apiKeys.columns.actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="px-6 font-medium">{row.name}</TableCell>
                      <TableCell><code className="font-mono text-xs">{row.prefix}…</code></TableCell>
                      <TableCell>
                        <div className="flex max-w-80 flex-wrap gap-1">{row.scopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.createdBy?.name || row.createdBy?.email
                          ? t("apiKeys.createdBy", { date: formatDate(row.createdAt), name: row.createdBy.name || row.createdBy.email })
                          : formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.lastUsedAt ? formatDate(row.lastUsedAt) : t("apiKeys.neverUsed")}</TableCell>
                      <TableCell className="px-6 text-right">
                        {row.revokedAt
                          ? <Badge variant="outline">{t("apiKeys.revoked", { date: formatDate(row.revokedAt) })}</Badge>
                          : <Button onClick={() => setRevoking(row)} size="sm" variant="outline">{t("apiKeys.revoke.action")}</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Surface>
      </SectionBlock>

      <Dialog onOpenChange={closeCreate} open={createOpen}>
        <DialogContent className="sm:max-w-lg">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("apiKeys.created.title", { name: created.name })}</DialogTitle>
                <DialogDescription>{t("apiKeys.created.description")}</DialogDescription>
              </DialogHeader>
              <SecretReveal value={created.key} warning={t("apiKeys.created.warning")} />
              <DialogFooter><Button onClick={() => closeCreate(false)}>{t("apiKeys.created.done")}</Button></DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("apiKeys.create.title")}</DialogTitle>
                <DialogDescription>{t("apiKeys.create.description")}</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="api-key-name">{t("apiKeys.create.nameLabel")}</FieldLabel>
                  <Input id="api-key-name" maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={t("apiKeys.create.namePlaceholder")} value={name} />
                </Field>
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-2 text-sm font-medium">{t("apiKeys.create.scopesLabel")}</legend>
                  {apiKeyScopes.map((scope) => (
                    <div className="flex items-start gap-3 text-sm" key={scope}>
                      <Checkbox
                        checked={scopes.includes(scope)}
                        id={`api-key-scope-${scopeKey(scope)}`}
                        onCheckedChange={(checked) => setScopes((current) => checked ? [...new Set([...current, scope])] : current.filter((value) => value !== scope))}
                      />
                      <label className="flex flex-col gap-0.5" htmlFor={`api-key-scope-${scopeKey(scope)}`}>
                        <code className="font-mono text-xs">{scope}</code>
                        <span className="text-muted-foreground">{t(`apiKeys.scopes.${scopeKey(scope)}`)}</span>
                      </label>
                    </div>
                  ))}
                </fieldset>
              </FieldGroup>
              <DialogFooter>
                <Button onClick={() => closeCreate(false)} variant="outline">{t("apiKeys.create.cancel")}</Button>
                <Button disabled={!name.trim() || scopes.length === 0 || create.isPending} onClick={() => create.mutate()}>{create.isPending ? t("apiKeys.create.creating") : t("apiKeys.create.submit")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        cancelLabel={t("apiKeys.revoke.cancel")}
        confirmLabel={t("apiKeys.revoke.confirm")}
        confirmVariant="destructive"
        description={t("apiKeys.revoke.description", { name: revoking?.name ?? "" })}
        onConfirm={async () => { if (revoking) await revoke.mutateAsync(revoking); }}
        onOpenChange={(open) => { if (!open) setRevoking(null); }}
        open={revoking !== null}
        pending={revoke.isPending}
        title={t("apiKeys.revoke.title")}
      />
    </>
  );
}
