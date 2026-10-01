"use client";

import { MessageSquare, MessagesSquare, MonitorSmartphone, Phone, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getChannelLabel, getContactChannels, type ContactChannel } from "@/lib/contact-display";
import { cn } from "@/lib/utils";

export const CONTACT_CHANNEL_ICONS: Record<ContactChannel, LucideIcon> = {
  phone_call: Phone,
  web_call: MonitorSmartphone,
  sms: MessageSquare,
  web_chat: MessagesSquare,
};

/** One icon per channel the contact used, each with an accessible name and a tooltip. */
export function ContactChannelIcons({ channels, className }: { channels: ReadonlyArray<string | null | undefined> | null | undefined; className?: string }) {
  const { t } = useTranslation("common");
  const used = getContactChannels(channels);
  if (!used.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1", className)}>
      {used.map((channel) => {
        const Icon = CONTACT_CHANNEL_ICONS[channel];
        const label = getChannelLabel(channel, t);
        return (
          <li key={channel}>
            <Tooltip>
              <TooltipTrigger
                render={<span aria-label={label} className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground" role="img" />}
              >
                <Icon aria-hidden="true" className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
