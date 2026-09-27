"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RulesSurface } from "@/components/rules-surface";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { ReceptionistPage, SaveRow, useReceptionist, useSaveReceptionist } from "./receptionist-page";

const TRANSFER_MODES = ["on_request", "on_urgent", "during_business_hours", "always", "never"] as const;

type TransferValues = { transferMode: string; transferNumber: string; rawNumber: string };

/** When calls go to a person, where they go, and this receptionist's rules. */
export function ReceptionistTransfersSurface({ agentId }: { agentId: string }) {
  const { i18n, t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const canManage = navigation?.canManage ?? false;
  const query = useReceptionist(agentId);
  const save = useSaveReceptionist(agentId);
  const saved = useMemo(() => query.data ? { transferMode: query.data.profile.transferMode, transferNumber: query.data.profile.transferNumber ?? "", rawNumber: query.data.profile.transferNumber ?? "" } : null, [query.data]);
  const [values, setValues] = useState<TransferValues | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = { mode: useId(), number: useId() };
  useEffect(() => { if (saved) setValues(saved); }, [saved]);

  // The phone input reports a valid E.164 number, or nothing while the text isn't one.
  const invalidNumber = Boolean(values && values.rawNumber.trim() && !values.transferNumber);
  const needsNumber = Boolean(values && values.transferMode !== "never" && !values.rawNumber.trim());
  const dirty = Boolean(saved && values && (saved.transferMode !== values.transferMode || saved.transferNumber !== values.transferNumber || (values.rawNumber.trim() === "" && saved.transferNumber !== "")));

  async function submit() {
    if (!values || !dirty || invalidNumber) return;
    setSaving(true);
    try {
      await save({ transferMode: values.transferMode, transferNumber: values.rawNumber.trim() ? values.transferNumber : null });
      toast.success(t("save.saved"));
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ReceptionistPage agentId={agentId} description={t("transfers.description")} section="transfers">
      <div className="flex flex-col gap-8">
        {!values ? <Skeleton className="h-48 w-full rounded-xl" /> : (
          <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <Surface className="p-6">
              <FieldGroup>
                <Field>
                  <FieldContent><FieldLabel htmlFor={ids.mode}>{t("transfers.mode.label")}</FieldLabel><FieldDescription>{t("transfers.mode.hint")}</FieldDescription></FieldContent>
                  <NativeSelect className="sm:w-72" disabled={!canManage} id={ids.mode} onChange={(event) => setValues({ ...values, transferMode: event.target.value })} value={values.transferMode}>
                    {TRANSFER_MODES.map((mode) => <NativeSelectOption key={mode} value={mode}>{t(`transfers.mode.options.${mode}`)}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldContent><FieldLabel htmlFor={ids.number}>{t("transfers.number.label")}</FieldLabel><FieldDescription>{t("transfers.number.hint")}</FieldDescription></FieldContent>
                  <PhoneInput
                    className="w-full min-w-0 sm:w-[14ch]"
                    containerClassName="w-full sm:w-fit"
                    disabled={!canManage}
                    id={ids.number}
                    locale={i18n.language}
                    maxLength={18}
                    onChange={(next) => setValues((current) => current ? { ...current, transferNumber: next ?? "" } : current)}
                    onRawValueChange={(raw) => setValues((current) => current ? { ...current, rawNumber: raw } : current)}
                    {...(values.transferNumber ? { value: values.transferNumber } : {})}
                  />
                  {invalidNumber ? <FieldError>{t("transfers.number.invalid")}</FieldError> : needsNumber ? <FieldDescription>{t("transfers.number.missing")}</FieldDescription> : null}
                </Field>
              </FieldGroup>
            </Surface>
            {canManage ? <SaveRow canSave={!invalidNumber} dirty={dirty} onReset={() => saved && setValues(saved)} onSave={() => void submit()} saving={saving} /> : null}
          </form>
        )}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-sm leading-snug font-medium">{t("transfers.rulesTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("transfers.rulesDescription")}</p>
          </div>
          <RulesSurface agentId={agentId} />
        </section>
      </div>
    </ReceptionistPage>
  );
}
