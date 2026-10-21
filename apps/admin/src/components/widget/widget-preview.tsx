"use client";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { readableOn, WidgetBubble, WidgetComposerField, WidgetHeader, WidgetLauncher } from "./widget-parts";

export type WidgetPreviewProps = {
  color: string;
  position: "bottom-right" | "bottom-left";
  title: string;
  subtitle?: string | undefined;
  greeting?: string | undefined;
};

/** The open chat over a stand-in website, drawn from the same pieces as the real widget. */
export function WidgetPreview({ color, position, title, subtitle, greeting }: WidgetPreviewProps) {
  const { t } = useTranslation("widget");
  const onColor = readableOn(color);
  const align = position === "bottom-left" ? "items-start" : "items-end";
  return (
    <figure className="flex h-full flex-col gap-3">
      <figcaption className="text-sm font-medium text-muted-foreground">{t("preview.label")}</figcaption>
      {/* Only a picture: nothing in it can be focused or read out as a second form. globals.css turns
          bg-white into the theme's card color, so the card color is pinned to white to keep the widget light. */}
      <div className={cn("relative flex [--card:#fff] min-h-[540px] flex-1 flex-col justify-end gap-3 overflow-hidden rounded-xl bg-zinc-100 p-4 text-zinc-900 ring-1 ring-zinc-900/5", align)} aria-hidden="true" inert>
        <div className="absolute inset-x-4 top-4 flex flex-col gap-2">
          <div className="h-2.5 w-24 rounded-full bg-zinc-200" />
          <div className="h-2 w-40 rounded-full bg-zinc-200/70" />
          <div className="h-2 w-32 rounded-full bg-zinc-200/70" />
        </div>
        <div className="relative flex h-[440px] w-full max-w-[320px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(24,24,27,0.08),0_4px_8px_rgba(24,24,27,0.04),0_16px_48px_rgba(24,24,27,0.16)]">
          <WidgetHeader color={color} onColor={onColor} title={title} subtitle={subtitle} />
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
            <div className="flex justify-start"><WidgetBubble from="assistant" color={color} onColor={onColor} className="whitespace-pre-wrap">{greeting || t("chat.welcome")}</WidgetBubble></div>
            <div className="flex justify-end"><WidgetBubble from="visitor" color={color} onColor={onColor}>{t("preview.visitorMessage")}</WidgetBubble></div>
          </div>
          <div className="px-3 pt-1 pb-3">
            <WidgetComposerField color={color} onColor={onColor} value="" placeholder={t("chat.composerPlaceholder")} sendLabel={t("chat.send")} canSend={false} />
          </div>
        </div>
        <div className="relative"><WidgetLauncher color={color} onColor={onColor} open /></div>
      </div>
    </figure>
  );
}
