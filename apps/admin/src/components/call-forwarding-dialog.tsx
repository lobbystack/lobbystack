"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { carrierGroupsFor, dialCode, type Carrier, type ForwardingMethod, type ForwardingMode, type NumberFormat } from "@/lib/call-forwarding";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import { useSetupAction } from "@/lib/use-setup-action";

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

/**
 * How to forward the owner's line to their LobbyStack number, carrier by
 * carrier. With `onConfirm`, an It works button follows the test call, for
 * carriers that strip the header that would tell us forwarding works.
 */
export function CallForwardingDialog({ confirming = false, e164, onConfirm, onOpenChange, open }: { confirming?: boolean; e164: string; onConfirm?: () => void; onOpenChange: (open: boolean) => void; open: boolean }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        {/* The content unmounts when the dialog closes, so each opening starts with no carrier picked. */}
        <ForwardingDialogHeader e164={e164} />
        <ForwardingGuide e164={e164} />
        {onConfirm ? <ForwardingConfirm confirming={confirming} onConfirm={onConfirm} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Opens the forwarding steps for the business's number when Home is reached
 * through the welcome email's link (`/?setup=phoneNumber`) after Getting
 * started is gone, so a trial number and a paid one both land there. It reads
 * the numbers only for that link.
 */
export function CallForwardingFromLink({ businessId }: { businessId: string }) {
  const linked = useSearchParams().get("setup") === "phoneNumber";
  const [open, setOpen] = useState(false);
  const numbers = useQuery({
    queryKey: ["phone-numbers", businessId],
    queryFn: () => requestJson<{ phoneNumbers: Array<{ e164: string }> }>(`/api/phone-numbers?businessId=${encodeURIComponent(businessId)}`),
    enabled: linked,
  });
  const e164 = numbers.data?.phoneNumbers[0]?.e164;
  useSetupAction(Boolean(e164), useCallback((action: string) => { if (action !== "phoneNumber") return false; setOpen(true); return true; }, []));
  return e164 ? <CallForwardingDialog e164={e164} onOpenChange={setOpen} open={open} /> : null;
}

function ForwardingConfirm({ confirming, onConfirm }: { confirming: boolean; onConfirm: () => void }) {
  const { t } = useTranslation("dashboard");
  return <Button className="self-start" disabled={confirming} onClick={onConfirm} type="button" variant="outline">{t("forwarding.itWorks")}</Button>;
}

function ForwardingDialogHeader({ e164 }: { e164: string }) {
  const { t, i18n } = useTranslation("dashboard");
  return (
    <DialogHeader>
      <DialogTitle>{t("forwarding.title", { number: formatPhoneNumberDisplay(e164, i18n.language) })}</DialogTitle>
      <DialogDescription>{t("forwarding.description")}</DialogDescription>
    </DialogHeader>
  );
}

/** The forwarding steps themselves. With no country it lists every North American carrier; a country with no carriers here gets general steps. */
export function ForwardingGuide({ country = null, e164 }: { country?: string | null; e164: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const groups = carrierGroupsFor(country);
  const [mode, setMode] = useState<ForwardingMode>("missed");
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const number = formatPhoneNumberDisplay(e164, i18n.language);
  const how = carrier?.[mode] ?? null;
  return (
    <>
      <Tabs onValueChange={(value) => setMode(value as ForwardingMode)} value={mode}>
        <TabsList className="w-full">
          <TabsTrigger value="missed">{t("forwarding.modes.missed.label")}</TabsTrigger>
          <TabsTrigger value="all">{t("forwarding.modes.all.label")}</TabsTrigger>
        </TabsList>
        <p className="type-body-muted">{t(`forwarding.modes.${mode}.help`)}</p>
      </Tabs>
      {groups.length === 0 ? <p className="type-body">{t(`forwarding.general.${mode}`, { number })}</p> : <Field>
        <FieldLabel htmlFor="forwarding-carrier">{t("forwarding.carrier.label")}</FieldLabel>
        <Combobox
          itemToStringLabel={(item: Carrier) => item.name}
          itemToStringValue={(item: Carrier) => item.id}
          items={groups.map((group) => ({ ...group, label: t(`forwarding.groups.${group.id}`) }))}
          onValueChange={(value: Carrier | null) => setCarrier(value)}
          value={carrier}
        >
          <ComboboxInput clearSearchLabel={t("common:accessibility.clearSearch")} id="forwarding-carrier" placeholder={t("forwarding.carrier.placeholder")} />
          <ComboboxContent>
            <ComboboxEmpty>{t("forwarding.carrier.empty")}</ComboboxEmpty>
            <ComboboxList>
              {(group: (typeof groups)[number] & { label: string }) => (
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
      </Field>}
      {carrier && how ? <Steps carrier={carrier} e164={e164} how={how} mode={mode} /> : null}
      {carrier && !how ? <p className="type-body-muted">{t(`forwarding.unsupported.${mode}`, { name: carrier.name, number })}</p> : null}
      {!carrier && groups.length > 0 ? <p className="type-body-muted">{t(`forwarding.notListed.${mode}`, { number })}</p> : null}
    </>
  );
}
