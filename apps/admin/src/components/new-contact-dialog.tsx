"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { apiContactCreateSchema } from "@lobbystack/shared";

import { PhoneField, type PhoneFieldValue } from "@/components/phone-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestJson } from "@/lib/request-json";

type Problem = "nameRequired" | "reachRequired" | "phoneInvalid" | "invalidEmail" | "exists" | "failed";

/** The header button that adds a contact by hand. Only owners and admins edit contacts, so `canCreate` is false for anyone else. */
export function NewContactButton({ businessId, canCreate }: { businessId: string; canCreate: boolean }) {
  const { t } = useTranslation("contacts");
  const [open, setOpen] = useState(false);
  if (!canCreate) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" />{t("create.action")}</Button>
      {/* Mounted only while open, so each new contact starts from empty fields. */}
      {open ? <NewContactDialog businessId={businessId} onOpenChange={setOpen} /> : null}
    </>
  );
}

/** Name, phone and email. Saving opens the new contact; a phone another contact has links to that contact instead. */
export function NewContactDialog({ businessId, onOpenChange }: { businessId: string; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("contacts");
  const router = useRouter();
  const queryClient = useQueryClient();
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<PhoneFieldValue>({ phone: "", incomplete: false });
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => requestJson<{ contactId: string }>(`/api/contacts?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify({ name: name.trim(), ...(phone.phone ? { phone: phone.phone } : {}), ...(email.trim() ? { email: email.trim() } : {}) }) }),
    onSuccess: ({ contactId }) => {
      void queryClient.invalidateQueries({ queryKey: ["contacts", businessId] });
      toast.success(t("create.saved"));
      onOpenChange(false);
      router.push(`/contacts/${contactId}`);
    },
    onError: (error) => {
      const { code, payload } = error as { code?: string; payload?: { contactId?: unknown } };
      if (code === "contact_exists") {
        setProblem("exists");
        setExistingId(typeof payload?.contactId === "string" ? payload.contactId : null);
        return;
      }
      setProblem("failed");
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    const next: Problem | null = !name.trim() ? "nameRequired"
      : phone.incomplete ? "phoneInvalid"
      : !phone.phone && !email.trim() ? "reachRequired"
      : email.trim() && !apiContactCreateSchema.shape.email.safeParse(email.trim()).success ? "invalidEmail"
      : null;
    setProblem(next);
    setExistingId(null);
    if (!next) save.mutate();
  };

  const nameError = problem === "nameRequired";
  const phoneError = problem === "phoneInvalid" || problem === "reachRequired" || problem === "exists";
  const emailError = problem === "invalidEmail";
  return (
    <Dialog onOpenChange={(next) => { if (!save.isPending) onOpenChange(next); }} open>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-6" noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("create.title")}</DialogTitle>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field data-invalid={nameError || undefined}>
              <FieldLabel htmlFor={nameId}>{t("create.name")}</FieldLabel>
              <Input aria-describedby={nameError ? `${nameId}-error` : undefined} aria-invalid={nameError || undefined} autoComplete="off" className="ph-mask" id={nameId} maxLength={200} onChange={(event) => setName(event.target.value)} value={name} />
              {nameError ? <FieldError id={`${nameId}-error`}>{t("create.nameRequired")}</FieldError> : null}
            </Field>
            <Field data-invalid={phoneError || undefined}>
              <FieldLabel htmlFor={phoneId}>{t("create.phone")}</FieldLabel>
              <PhoneField countryLabel={t("create.phoneCountry")} errorId={phoneError ? `${phoneId}-error` : undefined} id={phoneId} onChange={(next) => { setPhone(next); if (problem === "exists") setProblem(null); }} value={phone.phone} />
              {phoneError ? <FieldError id={`${phoneId}-error`}>
                {t(`create.${problem}`)}
                {problem === "exists" && existingId ? <> <Link className="font-medium text-foreground underline underline-offset-4" href={`/contacts/${existingId}`} onClick={() => onOpenChange(false)}>{t("create.openExisting")}</Link></> : null}
              </FieldError> : null}
            </Field>
            <Field data-invalid={emailError || undefined}>
              <FieldLabel htmlFor={emailId}>{t("create.email")}</FieldLabel>
              <Input aria-describedby={emailError ? `${emailId}-error` : undefined} aria-invalid={emailError || undefined} autoComplete="off" className="ph-mask" id={emailId} maxLength={320} onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
              {emailError ? <FieldError id={`${emailId}-error`}>{t("create.invalidEmail")}</FieldError> : null}
            </Field>
            {problem === "failed" ? <FieldError>{t("create.failed")}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button disabled={save.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">{t("create.cancel")}</Button>
            <Button loading={save.isPending} loadingLabel={t("create.saving")} type="submit">{t("create.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
