"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestJson } from "@/lib/request-json";

type EditableContact = { id: string; name: string | null; email: string | null };

/** Corrects a contact's name or email, for example a name the agent misheard. A cleared field is removed. */
export function EditContactDialog({ businessId, contact, onOpenChange }: { businessId: string; contact: EditableContact | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("contacts");
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contact) return;
    setName(contact.name ?? "");
    setEmail(contact.email ?? "");
    setError(null);
  }, [contact]);

  const save = useMutation({
    mutationFn: (current: EditableContact) => requestJson(`/api/contacts/${encodeURIComponent(current.id)}?businessId=${encodeURIComponent(businessId)}`, { method: "PATCH", body: JSON.stringify({ name: name.trim() || null, email: email.trim() || null }) }),
    onError: () => setError(t("edit.failed")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["contact", businessId] });
      toast.success(t("edit.saved"));
      onOpenChange(false);
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contact) return;
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(t("edit.invalidEmail")); return; }
    setError(null);
    save.mutate(contact);
  };

  return (
    <Dialog onOpenChange={(open) => { if (!save.isPending) onOpenChange(open); }} open={contact !== null}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-6" noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("edit.title")}</DialogTitle>
            <DialogDescription>{t("edit.description")}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field><FieldLabel htmlFor="edit-contact-name">{t("edit.name")}</FieldLabel><Input autoComplete="off" className="ph-mask" id="edit-contact-name" maxLength={200} onChange={(event) => setName(event.target.value)} value={name} /></Field>
            <Field><FieldLabel htmlFor="edit-contact-email">{t("edit.email")}</FieldLabel><Input autoComplete="off" className="ph-mask" id="edit-contact-email" maxLength={320} onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button disabled={save.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">{t("edit.cancel")}</Button>
            <Button loading={save.isPending} loadingLabel={t("edit.saving")} type="submit">{t("edit.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
