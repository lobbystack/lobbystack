"use client";

import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmActionDialog } from "./confirm-action-dialog";
import { PasskeyRowsSkeleton, PasskeysCardSkeleton } from "./loading-skeletons";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "./ui/item";
import { intlLocale } from "@/lib/locale";

type Passkey = { id: string; name?: string | null; createdAt?: string | null };

// What the browser reports when the person closes its prompt or it times out ("not allowed"), so there is nothing to tell them.
const CANCELLED_CODES = ["ERROR_CEREMONY_ABORTED", "AUTH_CANCELLED", "REGISTRATION_CANCELLED", "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY"];

async function postAuth(path: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/auth/${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("The passkey request failed.");
}

async function listPasskeys(): Promise<Passkey[]> {
  const response = await fetch("/api/auth/passkey/list-user-passkeys", { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Passkeys are unavailable.");
  return await response.json() as Passkey[];
}

async function passkeysAllowed(): Promise<boolean> {
  const response = await fetch("/api/auth/providers", { cache: "no-store" });
  return response.ok && (await response.json() as { passkey?: unknown } | null)?.passkey === true;
}

const PASSKEY_NAME_SUFFIX = "-passkey";
const PASSKEY_NAME_MAX_LENGTH = 100;

/** What a new passkey is called until the person renames it: the business's name in lowercase with dashes for spaces, then "-passkey". */
export function defaultPasskeyName(businessName?: string | null): string {
  const name = businessName?.trim().toLocaleLowerCase().replace(/\s+/gu, "-") ?? "";
  return name ? `${name.slice(0, PASSKEY_NAME_MAX_LENGTH - PASSKEY_NAME_SUFFIX.length)}${PASSKEY_NAME_SUFFIX}` : "passkey";
}

/** Lists the account's passkeys and adds, renames and removes them. Hidden where passkeys are off, such as a partner's host. */
export function AccountPasskeys({ businessName }: { businessName?: string | null | undefined }) {
  const { t, i18n } = useTranslation("settings");
  const queryClient = useQueryClient();
  const nameId = useId();
  const allowed = useQuery({ queryKey: ["passkeys-allowed"], queryFn: passkeysAllowed });
  const passkeys = useQuery({ queryKey: ["passkeys"], queryFn: listPasskeys, enabled: allowed.data === true });
  const [renaming, setRenaming] = useState<Passkey | null>(null);
  const [name, setName] = useState("");
  const [renameSubmitted, setRenameSubmitted] = useState(false);
  const [removing, setRemoving] = useState<Passkey | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["passkeys"] });

  const add = useMutation({
    mutationFn: async () => {
      const { authClient } = await import("@/lib/auth-client");
      const result = await authClient.passkey.addPasskey({ name: defaultPasskeyName(businessName) });
      if (result?.error) throw Object.assign(new Error(result.error.message), { code: (result.error as { code?: string }).code });
    },
    onSuccess: async () => { toast.success(t("account.passkeys.added")); await refresh(); },
    onError: (error: { code?: string }) => {
      if (error.code && CANCELLED_CODES.includes(error.code)) return;
      const messages: Record<string, string> = {
        ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: "account.passkeys.errors.alreadyAdded",
        SESSION_NOT_FRESH: "account.passkeys.errors.signInAgain",
        // The browser refuses a passkey for another address than the one set in PASSKEY_RP_ID.
        ERROR_INVALID_RP_ID: "account.passkeys.errors.wrongAddress",
      };
      toast.error(t(messages[error.code ?? ""] ?? "account.passkeys.errors.addFailed"));
    },
  });
  const rename = useMutation({
    mutationFn: async (target: { id: string; name: string }) => await postAuth("passkey/update-passkey", target),
    onSuccess: async () => { toast.success(t("account.passkeys.renamed")); closeRename(false); await refresh(); },
    onError: () => { toast.error(t("account.passkeys.errors.renameFailed")); },
  });
  const remove = useMutation({
    mutationFn: async (target: Passkey) => await postAuth("passkey/delete-passkey", { id: target.id }),
    onSuccess: async () => { toast.success(t("account.passkeys.removed")); await refresh(); },
    onError: () => { toast.error(t("account.passkeys.errors.removeFailed")); },
  });

  function openRename(passkey: Passkey) { setRenaming(passkey); setName(passkey.name ?? ""); setRenameSubmitted(false); }
  function closeRename(open: boolean) { if (!open) { setRenaming(null); setName(""); setRenameSubmitted(false); } }
  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRenameSubmitted(true);
    if (!renaming || !name.trim()) return;
    rename.mutate({ id: renaming.id, name: name.trim() });
  }

  // Holds the card's place while we learn whether this host offers passkeys, so the page doesn't jump when it does.
  if (allowed.isLoading) return <PasskeysCardSkeleton />;
  if (allowed.data !== true) return null;
  const label = (passkey: Passkey) => passkey.name?.trim() || t("account.passkeys.unnamed");
  const renameError = renameSubmitted && !name.trim() ? t("account.passkeys.rename.required") : null;
  return (
    <Item className="flex-wrap" variant="outline">
      <ItemContent>
        <ItemTitle>{t("account.passkeys.title")}</ItemTitle>
        <ItemDescription>{t("account.passkeys.description")}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button loading={add.isPending} onClick={() => add.mutate()} size="sm" type="button" variant="outline"><KeyRound data-icon="inline-start" />{t("account.passkeys.add")}</Button>
      </ItemActions>
      <div className="flex w-full basis-full flex-col">
        {passkeys.isLoading ? <PasskeyRowsSkeleton /> : null}
        {passkeys.isError ? <p className="text-sm text-destructive">{t("account.passkeys.errors.loadFailed")}</p> : null}
        {passkeys.data?.length === 0 ? <p className="text-sm text-muted-foreground">{t("account.passkeys.empty")}</p> : null}
        {passkeys.data?.length ? <ul className="flex flex-col divide-y divide-border">{passkeys.data.map((passkey) => (
          <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={passkey.id}>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{label(passkey)}</span>
              {passkey.createdAt ? <span className="text-xs text-muted-foreground">{t("account.passkeys.addedOn", { date: new Intl.DateTimeFormat(intlLocale(i18n.language), { dateStyle: "medium" }).format(new Date(passkey.createdAt)) })}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => openRename(passkey)} size="xs" type="button" variant="outline">{t("account.passkeys.rename.action")}</Button>
              <Button onClick={() => setRemoving(passkey)} size="xs" type="button" variant="destructive">{t("account.passkeys.remove")}</Button>
            </div>
          </li>
        ))}</ul> : null}
      </div>
      <Dialog onOpenChange={closeRename} open={renaming !== null}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("account.passkeys.rename.title")}</DialogTitle><DialogDescription>{t("account.passkeys.rename.description")}</DialogDescription></DialogHeader>
          <form className="flex flex-col gap-6" noValidate onSubmit={submitRename}>
            <Field data-invalid={renameError ? true : undefined}>
              <FieldLabel htmlFor={nameId}>{t("account.passkeys.rename.label")}</FieldLabel>
              <Input aria-describedby={renameError ? `${nameId}-error` : undefined} aria-invalid={renameError ? true : undefined} id={nameId} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder={t("account.passkeys.rename.placeholder")} value={name} />
              {renameError ? <FieldError id={`${nameId}-error`}>{renameError}</FieldError> : null}
            </Field>
            <DialogFooter>
              <DialogClose render={<Button disabled={rename.isPending} type="button" variant="outline" />}>{t("account.actions.cancel")}</DialogClose>
              <Button disabled={rename.isPending} type="submit">{t("account.passkeys.rename.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        cancelLabel={t("account.actions.cancel")}
        confirmLabel={t("account.passkeys.remove")}
        confirmVariant="destructive"
        description={t("account.passkeys.removeDescription", { name: removing ? label(removing) : "" })}
        onConfirm={async () => { if (removing) await remove.mutateAsync(removing); }}
        onOpenChange={(open) => { if (!open) setRemoving(null); }}
        open={removing !== null}
        pending={remove.isPending}
        title={t("account.passkeys.removeTitle")}
      />
    </Item>
  );
}
