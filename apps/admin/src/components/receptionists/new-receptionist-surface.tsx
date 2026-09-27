"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Surface } from "@/components/ui/surface";
import { NAVIGATION_QUERY_KEY, useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { defaultReceptionist, receptionistPath } from "@/lib/navigation-routes";
import { requestJson } from "@/lib/request-json";
import { BusinessPage } from "./business-page";
import { receptionistsQueryKey } from "./receptionist-page";

/** Adds a receptionist that starts as a copy of an existing one. */
export function NewReceptionistSurface() {
  const { t } = useTranslation("receptionists");
  const router = useRouter();
  const queryClient = useQueryClient();
  const navigation = useNavigationSnapshot();
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState(defaultReceptionist(navigation?.receptionists ?? [])?.id ?? "");
  const [saving, setSaving] = useState(false);
  const ids = { name: useId(), copy: useId() };

  async function create() {
    if (!navigation || !name.trim()) return;
    setSaving(true);
    try {
      const { receptionist } = await requestJson<{ receptionist: { id: string; name: string } }>(`/api/receptionists?businessId=${encodeURIComponent(navigation.businessId)}`, { method: "POST", body: JSON.stringify({ name: name.trim(), ...(copyFrom ? { copyFromAgentId: copyFrom } : {}) }) });
      await Promise.all([queryClient.invalidateQueries({ queryKey: NAVIGATION_QUERY_KEY }), queryClient.invalidateQueries({ queryKey: receptionistsQueryKey(navigation.businessId) })]);
      toast.success(t("create.created", { name: receptionist.name }));
      router.push(receptionistPath(receptionist.id));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save.failed"));
      setSaving(false);
    }
  }

  return (
    <BusinessPage title={t("create.title")}>
      <form className="flex max-w-2xl flex-col gap-6" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <Surface className="p-6">
          <FieldGroup>
            <Field>
              <FieldContent><FieldLabel htmlFor={ids.name}>{t("behavior.name.label")}</FieldLabel><FieldDescription>{t("create.nameHint")}</FieldDescription></FieldContent>
              <Input id={ids.name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t("create.namePlaceholder")} value={name} />
            </Field>
            <Field>
              <FieldContent><FieldLabel htmlFor={ids.copy}>{t("create.copyLabel")}</FieldLabel><FieldDescription>{t("create.copyHint")}</FieldDescription></FieldContent>
              <NativeSelect id={ids.copy} onChange={(event) => setCopyFrom(event.target.value)} value={copyFrom}>
                {(navigation?.receptionists ?? []).map((receptionist) => <NativeSelectOption key={receptionist.id} value={receptionist.id}>{receptionist.name}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
          </FieldGroup>
        </Surface>
        <p className="text-sm text-muted-foreground">{t("create.afterHint")}</p>
        <div className="flex justify-end gap-2">
          <Button disabled={saving} onClick={() => router.back()} type="button" variant="ghost">{t("create.cancel")}</Button>
          <Button disabled={saving || !name.trim()} type="submit">
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {saving ? t("create.creating") : t("create.submit")}
          </Button>
        </div>
      </form>
    </BusinessPage>
  );
}
