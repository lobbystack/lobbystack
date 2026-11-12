"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { apiContactUpdateSchema } from "@lobbystack/shared";

import { FieldControlSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PhoneField, type PhoneFieldValue } from "@/components/phone-field";
import { Input } from "@/components/ui/input";
import { requestJson } from "@/lib/request-json";

type EditableContact = { id: string; name: string | null; phone?: string | null; email: string | null };
type ContactDetails = { id: string; name?: string | null; phone?: string; email?: string | null };

/** Corrects a contact's name, phone or email, for example a name the agent misheard. A cleared name or email is removed; a phone can change but not go. */
export function EditContactDialog({ businessId, contact, onOpenChange }: { businessId: string; contact: EditableContact | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("contacts");
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<PhoneFieldValue>({ phone: "", incomplete: false });
  const phoneId = useId();
  // The phone field picks its country from the number it starts with, so it waits until the contact is loaded into the form.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contact) return;
    setName(contact.name ?? "");
    setPhone({ phone: contact.phone ?? "", incomplete: false });
    setEmail(contact.email ?? "");
    setLoadedId(contact.id);
    setError(null);
  }, [contact]);

  const save = useMutation({
    mutationFn: ({ id, ...details }: ContactDetails) => requestJson(`/api/contacts/${encodeURIComponent(id)}?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", body: JSON.stringify(details) }),
    onError: (caught) => setError(t((caught as { code?: string }).code === "contact_exists" ? "create.exists" : "edit.failed")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["contact", businessId] });
      toast.success(t("edit.saved"));
      onOpenChange(false);
    },
  });

  // Only a field that differs from the saved contact is sent, so an unchanged save writes nothing.
  const nextName = name.trim() || null;
  const nextEmail = email.trim() || null;
  const changes = contact ? {
    ...(nextName !== (contact.name ?? null) ? { name: nextName } : {}),
    ...(phone.phone && phone.phone !== (contact.phone ?? "") ? { phone: phone.phone } : {}),
    ...(nextEmail !== (contact.email ?? null) ? { email: nextEmail } : {}),
  } : {};
  const changed = Object.keys(changes).length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contact || !changed) return;
    // A number can be changed but not removed, and a half-typed one can't be saved.
    if (phone.incomplete || (!phone.phone && contact.phone)) { setError(t("create.phoneInvalid")); return; }
    if (email.trim() && !apiContactUpdateSchema.shape.email.safeParse(email.trim()).success) { setError(t("edit.invalidEmail")); return; }
    setError(null);
    save.mutate({ id: contact.id, ...changes });
  };

  return (
    <Dialog onOpenChange={(open) => { if (!save.isPending) onOpenChange(open); }} open={contact !== null}>
      <DialogContent>
        <form className="grid gap-6" noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("edit.title")}</DialogTitle>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field><FieldLabel htmlFor="edit-contact-name">{t("edit.name")}</FieldLabel><Input autoComplete="off" className="ph-mask" id="edit-contact-name" maxLength={200} onChange={(event) => setName(event.target.value)} placeholder={t("edit.namePlaceholder")} value={name} /></Field>
            <Field><FieldLabel htmlFor={phoneId}>{t("create.phone")}</FieldLabel>{loadedId === contact?.id ? <PhoneField countryLabel={t("create.phoneCountry")} id={phoneId} onChange={setPhone} value={phone.phone} /> : <FieldControlSkeleton />}</Field>
            <Field><FieldLabel htmlFor="edit-contact-email">{t("edit.email")}</FieldLabel><Input autoComplete="off" className="ph-mask" id="edit-contact-email" maxLength={320} onChange={(event) => setEmail(event.target.value)} placeholder={t("edit.emailPlaceholder")} type="email" value={email} /></Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button disabled={save.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">{t("edit.cancel")}</Button>
            <Button disabled={!changed} loading={save.isPending} loadingLabel={t("edit.saving")} type="submit">{t("edit.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
