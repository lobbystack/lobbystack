"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CONTACT_PASSCODE_MAX_LENGTH, isContactPasscode, isGuessableContactPasscode, randomContactPasscode } from "@lobbystack/shared";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DetailSection } from "@/components/detail-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

/** Whether the contact has a keypad PIN, as the contact detail API returns it. */
export type ContactPasscodeStatus = { setAt: string; locked: boolean } | null;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
}

/**
 * The contact's keypad PIN, which callers type to change appointments when AI
 * settings require one. The PIN is shown only while it's being set: the server
 * keeps a hash.
 */
export function ContactPasscodeSection({ businessId, canMutate, contactId, locale, passcode }: { businessId: string; canMutate: boolean; contactId: string; locale: string; passcode: ContactPasscodeStatus | undefined }) {
  const { t } = useTranslation("contacts");
  const queryClient = useQueryClient();
  const [setOpen, setSetOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const url = `/api/contacts/${encodeURIComponent(contactId)}/passcode?businessId=${encodeURIComponent(businessId)}`;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["contact", businessId, contactId] });
  const save = useMutation({
    mutationFn: (next: string) => requestJson(url, { method: "PUT", body: JSON.stringify({ passcode: next }) }),
    onSuccess: () => {
      setSetOpen(false);
      setValue("");
      toast.success(t("detail.passcode.saved"));
      refresh();
    },
    onError: (cause) => setError(t(errorCode(cause) === "guessable_passcode" ? "detail.passcode.guessable" : errorCode(cause) === "invalid_passcode" ? "detail.passcode.invalid" : "detail.passcode.saveFailed")),
  });
  const remove = useMutation({
    mutationFn: () => requestJson(url, { method: "DELETE" }),
    onSuccess: refresh,
    onError: () => toast.error(t("detail.passcode.removeFailed")),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isContactPasscode(value)) return setError(t("detail.passcode.invalid"));
    if (isGuessableContactPasscode(value)) return setError(t("detail.passcode.guessable"));
    setError(null);
    save.mutate(value);
  }

  const status = passcode ? (passcode.locked ? t("detail.passcode.statusLocked") : t("detail.passcode.statusSet")) : t("detail.passcode.statusNotSet");
  return <DetailSection className="border-t" title={t("detail.passcode.title")}>
    <p className="type-body-muted">{t("detail.passcode.hint")}</p>
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">
      <dt className="type-meta">{t("detail.passcode.status")}</dt>
      <dd className="type-body">{passcode?.locked ? <Badge variant="destructive">{status}</Badge> : status}</dd>
      <dt className="type-meta">{t("detail.passcode.setAt")}</dt>
      <dd className="type-body">{passcode ? formatDateTime(passcode.setAt, locale, { dateStyle: "medium", timeStyle: "short" }) : t("detail.details.notSet")}</dd>
    </dl>
    {canMutate ? <div className="flex flex-wrap gap-2">
      <Button onClick={() => { setValue(""); setError(null); setSetOpen(true); }} size="sm" type="button" variant="outline">{passcode ? t("detail.passcode.changeAction") : t("detail.passcode.setAction")}</Button>
      {passcode ? <Button onClick={() => setRemoveOpen(true)} size="sm" type="button" variant="ghost">{t("detail.passcode.removeAction")}</Button> : null}
    </div> : null}

    <Dialog onOpenChange={(open) => { if (!save.isPending) setSetOpen(open); }} open={setOpen}>
      <DialogContent>
        <form className="flex flex-col gap-6" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("detail.passcode.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("detail.passcode.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="contact-passcode">{t("detail.passcode.label")}</FieldLabel>
            <div className="flex gap-2">
              <Input aria-invalid={error ? true : undefined} autoComplete="off" className="font-mono tracking-widest" id="contact-passcode" inputMode="numeric" maxLength={CONTACT_PASSCODE_MAX_LENGTH} onChange={(event) => { setValue(event.target.value.replace(/\D/g, "").slice(0, CONTACT_PASSCODE_MAX_LENGTH)); setError(null); }} placeholder={t("detail.passcode.placeholder")} value={value} />
              <Button onClick={() => { setValue(randomContactPasscode()); setError(null); }} type="button" variant="outline">{t("detail.passcode.generate")}</Button>
            </div>
            {error ? <FieldError>{error}</FieldError> : <FieldDescription>{t("detail.passcode.fieldHint")}</FieldDescription>}
          </Field>
          <DialogFooter>
            <Button disabled={save.isPending} onClick={() => setSetOpen(false)} type="button" variant="outline">{t("detail.passcode.cancel")}</Button>
            <Button disabled={!value} loading={save.isPending} type="submit">{t("detail.passcode.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmActionDialog cancelLabel={t("detail.passcode.cancel")} confirmLabel={t("detail.passcode.removeConfirm")} confirmVariant="destructive" description={t("detail.passcode.removeDescription")} onConfirm={async () => { await remove.mutateAsync(); }} onOpenChange={(open) => { if (!remove.isPending) setRemoveOpen(open); }} open={removeOpen} pending={remove.isPending} title={t("detail.passcode.removeTitle")} />
  </DetailSection>;
}
