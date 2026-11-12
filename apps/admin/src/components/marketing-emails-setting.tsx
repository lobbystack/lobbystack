"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MarketingEmailsSkeleton } from "@/components/loading-skeletons";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { requestJson } from "@/lib/request-json";

const QUERY_KEY = ["marketing-email-preference"];

type Preference = { subscribed: boolean };

/** The person's saved choice. The notifications page reads it too, so its sections turn real together. */
export function useMarketingEmailPreference(enabled = true) {
  return useQuery({ queryKey: QUERY_KEY, queryFn: () => requestJson<Preference>("/api/preferences/marketing-emails"), enabled });
}

/**
 * The signed-in person's choice to get the host's marketing emails, the same
 * one an email's Unsubscribe link turns off. It belongs to the person, not the
 * business, so it shows the same in every business.
 */
export function MarketingEmailsSetting() {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const preference = useMarketingEmailPreference();
  const save = useMutation({
    mutationFn: (subscribed: boolean) => requestJson<Preference>("/api/preferences/marketing-emails", { method: "PATCH", body: JSON.stringify({ subscribed }) }),
    onMutate: async (subscribed) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Preference>(QUERY_KEY);
      queryClient.setQueryData<Preference>(QUERY_KEY, { subscribed });
      return { previous };
    },
    onError: (_error, _subscribed, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast.error(t("notifications.marketing.saveFailed"));
    },
    onSettled: async () => { await queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
  const labels = { title: t("notifications.marketing.title"), label: t("notifications.marketing.label"), description: t("notifications.marketing.description") };
  if (!preference.data) return <MarketingEmailsSkeleton labels={labels} />;
  return (
    <section className="flex flex-col gap-4">
      <h3 className="type-title">{labels.title}</h3>
      <Surface className="flex flex-col">
        <Item className="rounded-none border-0">
          <ItemContent><ItemTitle>{labels.label}</ItemTitle><ItemDescription>{labels.description}</ItemDescription></ItemContent>
          <ItemActions><Switch aria-label={labels.label} checked={preference.data.subscribed} disabled={save.isPending} onCheckedChange={(checked) => save.mutate(checked)} /></ItemActions>
        </Item>
      </Surface>
    </section>
  );
}
