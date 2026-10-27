"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { offeredApiKeyScopes, type ApiKeyScope } from "@lobbystack/shared";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
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
import { requestJson } from "@/lib/request-json";
import { intlLocale } from "@/lib/locale";

/** A key as an API keys page lists it: a business's own key, or a partner's platform key. */
export type ApiKeyRecord = {
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

const DEFAULT_SCOPES: ApiKeyScope[] = ["calls:read", "contacts:read", "appointments:read", "messages:read", "business:read"];

/** Where an API keys page reads, makes and revokes its keys. */
export type ApiKeysSource = {
  queryKey: readonly unknown[];
  list: () => Promise<ApiKeyRecord[]>;
  create: (input: { name: string; scopes: ApiKeyScope[] }) => Promise<{ key: string; record: ApiKeyRecord }>;
  revoke: (record: ApiKeyRecord) => Promise<unknown>;
};

type ApiKeysSurfaceProps = {
  /** The translations the page reads its apiKeys.* copy from. */
  namespace: "settings" | "partner";
  /** A section of Settings, or a page of its own, as in the partner console. */
  layout: "section" | "page";
  /** Whether the page waits on something before it knows who may manage keys. */
  loading: boolean;
  canManage: boolean;
  scopes: readonly ApiKeyScope[];
  source: ApiKeysSource;
};

/** The page layout has a title only; Settings' section keeps its description. */
function ApiKeysFrame({ layout, title, description, action, children }: { layout: ApiKeysSurfaceProps["layout"]; title: string; description: ReactNode; action: ReactNode; children: ReactNode }) {
  if (layout === "section") return <SectionBlock action={action} description={description} title={title}>{children}</SectionBlock>;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader actions={action} title={title} />
      {children}
    </div>
  );
}

/**
 * An API keys page: the keys with their scopes and last use, a dialog that
 * makes a key and shows it once, and revoking with a confirmation. Settings
 * uses it for a business's own keys and the partner console for a partner's
 * platform keys; each passes where its keys live and who may manage them, and
 * the server holds the same rules.
 */
export function ApiKeysSurface({ namespace, layout, loading, canManage, scopes: offeredScopes, source }: ApiKeysSurfaceProps) {
  const { i18n, t } = useTranslation(namespace);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(DEFAULT_SCOPES);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRecord | null>(null);
  const keys = useQuery({ queryKey: source.queryKey, queryFn: source.list, enabled: canManage && !loading });
  const formatDate = (value: string) => new Intl.DateTimeFormat(intlLocale(i18n.resolvedLanguage ?? i18n.language), { dateStyle: "medium" }).format(new Date(value));

  const create = useMutation({
    mutationFn: () => source.create({ name: name.trim(), scopes }),
    onSuccess: async (result) => {
      setCreated({ key: result.key, name: result.record.name });
      setName("");
      await queryClient.invalidateQueries({ queryKey: source.queryKey });
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: (key: ApiKeyRecord) => source.revoke(key),
    onSuccess: async () => { toast.success(t("apiKeys.revoke.done")); await queryClient.invalidateQueries({ queryKey: source.queryKey }); },
    onError: () => toast.error(t("apiKeys.revoke.failed")),
  });

  function closeCreate(open: boolean) {
    setCreateOpen(open);
    if (!open) setCreated(null);
  }

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!canManage) return <Alert><AlertTitle>{t("apiKeys.restricted.title")}</AlertTitle><AlertDescription>{t("apiKeys.restricted.description")}</AlertDescription></Alert>;

  const rows = keys.data ?? [];
  return (
    <>
      <ApiKeysFrame
        action={<Button onClick={() => setCreateOpen(true)} size="sm"><KeyRound data-icon="inline-start" />{t("apiKeys.create.action")}</Button>}
        description={layout === "section" ? t("apiKeys.description") : null}
        layout={layout}
        title={t("apiKeys.title")}
      >
        <Surface>
          {keys.isLoading ? <div className="p-6"><Skeleton className="h-24 w-full rounded-xl" /></div> : rows.length === 0 ? (
            layout === "page" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <h2 className="text-base font-medium">{t("apiKeys.empty")}</h2>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t("apiKeys.emptyDescription")}</p>
            </div>
          ) : <p className="type-body-muted p-6 text-center">{t("apiKeys.empty")}</p>
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
      </ApiKeysFrame>

      <Dialog onOpenChange={closeCreate} open={createOpen}>
        {/* The scope list is taller than a laptop's screen, so the dialog scrolls. */}
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("apiKeys.created.title", { name: created.name })}</DialogTitle>
                <DialogDescription>{t("apiKeys.created.description")}</DialogDescription>
              </DialogHeader>
              <SecretReveal namespace={namespace} value={created.key} warning={t("apiKeys.created.warning")} />
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
                  {offeredScopes.map((scope) => (
                    <div className="flex items-start gap-3 text-sm" key={scope}>
                      <Checkbox
                        aria-labelledby={`api-key-scope-${scopeKey(scope)}-label`}
                        checked={scopes.includes(scope)}
                        id={`api-key-scope-${scopeKey(scope)}`}
                        onCheckedChange={(checked) => setScopes((current) => checked ? [...new Set([...current, scope])] : current.filter((value) => value !== scope))}
                      />
                      <label className="flex flex-col gap-0.5" htmlFor={`api-key-scope-${scopeKey(scope)}`} id={`api-key-scope-${scopeKey(scope)}-label`}>
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

/** Settings > API keys: the active business's own keys, which only its owners and admins manage. */
export function LiveApiKeysSurface() {
  const { businesses, business } = useActiveBusiness();
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const businessId = business?.businessId;
  const query = () => `businessId=${encodeURIComponent(businessId!)}`;
  return (
    <ApiKeysSurface
      canManage={canManage}
      layout="section"
      loading={businesses.isLoading}
      namespace="settings"
      scopes={offeredApiKeyScopes}
      source={{
        queryKey: ["api-keys", businessId],
        list: async () => (await requestJson<{ keys: ApiKeyRecord[] }>(`/api/api-keys?${query()}`)).keys,
        create: async (input) => {
          const result = await requestJson<{ key: string; apiKey: ApiKeyRecord }>(`/api/api-keys?${query()}`, { method: "POST", body: JSON.stringify(input) });
          return { key: result.key, record: result.apiKey };
        },
        revoke: (key) => requestJson(`/api/api-keys/${encodeURIComponent(key.id)}?${query()}`, { method: "DELETE" }),
      }}
    />
  );
}
