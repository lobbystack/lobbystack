"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { carrierGroups, dialCode, type Carrier, type ForwardingMethod, type ForwardingMode, type NumberFormat } from "@/lib/call-forwarding";
import { formatPhoneNumberDisplay } from "@/lib/phone";

/** A code to dial. Lines that ask for the number after the code get it as a separate instruction. */
function DialStep({ label, template, e164, format }: { label: string; template: string; e164: string; format: NumberFormat }) {
  const { t } = useTranslation("dashboard");
  const asks = !template.includes("{number}");
  return (
    <>
      {label}
      <p className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2 type-technical-value break-all text-foreground select-all">{dialCode(template, e164, format)}</p>
      {asks ? <p className="mt-2">{t("forwarding.code.enterNumber", { number: dialCode("{number}", e164, format) })}</p> : null}
    </>
  );
}

function Steps({ carrier, how, e164, mode }: { carrier: Carrier; how: ForwardingMethod; e164: string; mode: ForwardingMode }) {
  const { t, i18n } = useTranslation("dashboard");
  const number = formatPhoneNumberDisplay(e164, i18n.language);
  const path = how.method === "settings" ? how.path.join(" › ") : "";
  const steps = how.method === "code"
    ? [
      <DialStep e164={e164} format={how.numberFormat} key="on" label={t("forwarding.code.dial")} template={how.on} />,
      t("forwarding.code.call"),
      ...(how.busy ? [<DialStep e164={e164} format={how.numberFormat} key="busy" label={t("forwarding.code.busy")} template={how.busy} />] : []),
      ...(how.unreachable ? [<DialStep e164={e164} format={how.numberFormat} key="unreachable" label={t("forwarding.code.unreachable")} template={how.unreachable} />] : []),
    ]
    : [how.where === "phone" ? t("forwarding.settings.openPhone", { path }) : t("forwarding.settings.open", { name: carrier.name, path }), t(`forwarding.settings.${mode}`, { number })];
  const mobile = carrier.group === "usMobile" || carrier.group === "caMobile";
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex list-decimal flex-col gap-3 pl-5 type-body">
        {steps.map((step, index) => <li key={index}>{step}</li>)}
      </ol>
      {how.method === "code" ? <p className="type-body-muted">{t("forwarding.code.off", { code: how.off.join(", ") })}</p> : null}
      {how.method === "settings" && mode === "missed" && carrier.group === "voip" ? <p className="type-body-muted">{t("forwarding.notes.ringTime")}</p> : null}
      {how.notes?.map((note) => <p className="type-body-muted" key={note}>{t(`forwarding.notes.${note}`, { name: carrier.name, number })}</p>)}
      {mode === "missed" && mobile ? <p className="type-body-muted">{t("forwarding.notes.iphone")}</p> : null}
      <p className="type-body-muted">{t(`forwarding.test.${mode}`)}</p>
    </div>
  );
}

/** How to forward the owner's line to their LobbyStack number, carrier by carrier. */
export function CallForwardingDialog({ e164, onOpenChange, open }: { e164: string; onOpenChange: (open: boolean) => void; open: boolean }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        {/* The content unmounts when the dialog closes, so each opening starts with no carrier picked. */}
        <ForwardingGuide e164={e164} />
      </DialogContent>
    </Dialog>
  );
}

function ForwardingGuide({ e164 }: { e164: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const [mode, setMode] = useState<ForwardingMode>("missed");
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const number = formatPhoneNumberDisplay(e164, i18n.language);
  const how = carrier?.[mode] ?? null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("forwarding.title", { number })}</DialogTitle>
        <DialogDescription>{t("forwarding.description")}</DialogDescription>
      </DialogHeader>
      <Tabs onValueChange={(value) => setMode(value as ForwardingMode)} value={mode}>
        <TabsList className="w-full">
          <TabsTrigger value="missed">{t("forwarding.modes.missed.label")}</TabsTrigger>
          <TabsTrigger value="all">{t("forwarding.modes.all.label")}</TabsTrigger>
        </TabsList>
        <p className="type-body-muted">{t(`forwarding.modes.${mode}.help`)}</p>
      </Tabs>
      <Field>
        <FieldLabel htmlFor="forwarding-carrier">{t("forwarding.carrier.label")}</FieldLabel>
        <Combobox
          itemToStringLabel={(item: Carrier) => item.name}
          itemToStringValue={(item: Carrier) => item.id}
          items={carrierGroups.map((group) => ({ ...group, label: t(`forwarding.groups.${group.id}`) }))}
          onValueChange={(value: Carrier | null) => setCarrier(value)}
          value={carrier}
        >
          <ComboboxInput id="forwarding-carrier" placeholder={t("forwarding.carrier.placeholder")} />
          <ComboboxContent>
            <ComboboxEmpty>{t("forwarding.carrier.empty")}</ComboboxEmpty>
            <ComboboxList>
              {(group: (typeof carrierGroups)[number] & { label: string }) => (
                <ComboboxGroup items={group.items} key={group.id}>
                  <ComboboxLabel>{group.label}</ComboboxLabel>
                  <ComboboxCollection>
                    {(item: Carrier) => <ComboboxItem key={item.id} value={item}>{item.name}</ComboboxItem>}
                  </ComboboxCollection>
                </ComboboxGroup>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>
      {carrier && how ? <Steps carrier={carrier} e164={e164} how={how} mode={mode} /> : null}
      {carrier && !how ? <p className="type-body-muted">{t(`forwarding.unsupported.${mode}`, { name: carrier.name, number })}</p> : null}
      {!carrier ? <p className="type-body-muted">{t(`forwarding.notListed.${mode}`, { number })}</p> : null}
    </>
  );
}
