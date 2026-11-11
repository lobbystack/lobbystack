"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BusinessNotificationItem } from "@lobbystack/shared";

import { NotificationListSkeleton } from "@/components/loading-skeletons";
import { useTelemetry } from "@/components/product-analytics";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { formatRelativeTime } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { NOTIFICATION_ICONS, notificationCopy, notificationHref } from "./notification-copy";

type NotificationBellProps = {
  /** Opens a dashboard page. The phone's menu sheet passes its own, which closes the sheet first. */
  navigate?: (href: string) => void;
  /** Where the panel opens beside the bell. */
  side?: "bottom" | "right";
  className?: string;
};

/** The bell's dot and the panel's unread marks. */
function UnreadDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full bg-primary", className)} data-unread-dot="" />;
}

/**
 * The notification bell: account and setup things the team would otherwise
 * miss, in one list. Action required comes first and stays until it's
 * resolved; clicking an item marks it read and opens the page where you act.
 */
export function NotificationBell({ className, navigate, side = "bottom" }: NotificationBellProps) {
  const { t, i18n } = useTranslation("nav");
  const router = useRouter();
  const telemetry = useTelemetry();
  const [open, setOpen] = useState(false);
  const { businessId, notifications, items, unreadCount, markAllRead, markItemRead } = useNotifications();
  if (!businessId) return null;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) telemetry.track("web.notifications.bell_opened", { businessId, unreadCount, actionCount: items.filter((item) => item.category === "action").length });
  };

  const openItem = (item: BusinessNotificationItem) => {
    if (!item.read) markItemRead(item.id);
    telemetry.track("web.notifications.item_clicked", { businessId, kind: item.kind, category: item.category, unread: !item.read });
    setOpen(false);
    const href = notificationHref(item, i18n.language);
    if (!href) return;
    if (/^https?:\/\//.test(href)) { window.open(href, "_blank", "noopener,noreferrer"); return; }
    if (navigate) navigate(href);
    else router.push(href);
  };

  const label = unreadCount ? t("notifications.bellUnread", { count: unreadCount }) : t("notifications.bell");
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger render={<Button aria-label={label} className={cn("relative shrink-0", className)} data-notification-bell="" size="icon-sm" title={t("notifications.bell")} type="button" variant="ghost" />}>
        <Bell aria-hidden="true" className="size-4" />
        {unreadCount ? <UnreadDot className="absolute top-1.5 right-1.5 ring-2 ring-sidebar" /> : null}
      </PopoverTrigger>
      <PopoverContent
        align={side === "right" ? "start" : "end"}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
        data-notification-panel=""
        side={side}
        sideOffset={8}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <PopoverTitle className="type-card-title">{t("notifications.title")}</PopoverTitle>
          <Button disabled={!unreadCount} onClick={markAllRead} size="xs" type="button" variant="ghost">{t("notifications.markAllRead")}</Button>
        </div>
        <div className="max-h-[min(28rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain">
          {notifications.isPending ? <NotificationListSkeleton label={t("notifications.loading")} /> : items.length ? (
            <ul className="flex flex-col divide-y">
              {items.map((item) => <NotificationRow item={item} key={item.id} language={i18n.language} onOpen={() => openItem(item)} />)}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center type-body-muted" data-notifications-empty="">{t("notifications.empty")}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ item, language, onOpen }: { item: BusinessNotificationItem; language: string; onOpen: () => void }) {
  const { t } = useTranslation("nav");
  const Icon = NOTIFICATION_ICONS[item.kind];
  const { title, line } = notificationCopy(item, t, language);
  const action = item.category === "action";
  return (
    <li>
      <button
        className="flex w-full items-start gap-3 px-4 py-3 text-left outline-hidden transition-colors hover:bg-accent focus-visible:bg-accent"
        data-category={item.category}
        data-kind={item.kind}
        data-read={item.read ? "" : undefined}
        onClick={onOpen}
        type="button"
      >
        <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4", action ? "bg-status-warning text-status-warning-foreground" : "bg-muted text-muted-foreground")}>
          <Icon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("type-body", !item.read && "font-medium")}>{title}</span>
          <span className="line-clamp-2 type-body-muted">{line}</span>
          <time className="type-caption text-muted-foreground" dateTime={item.occurredAt}>{formatRelativeTime(item.occurredAt, language, new Date(), "auto")}</time>
        </span>
        {item.read ? null : <><UnreadDot className="mt-1.5" /><span className="sr-only">{t("notifications.unread")}</span></>}
      </button>
    </li>
  );
}
