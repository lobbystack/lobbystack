import { WIDGET_COLOR_PATTERN } from "@lobbystack/shared";

import { WidgetChatClient } from "@/components/widget/widget-chat-client";

// The root layout negotiates the request locale; widget keys are runtime data.
export const dynamic = "force-dynamic";

export default async function WidgetEmbedPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ color?: string | string[] }> }) {
  const { key } = await params;
  if (!key) return null;
  // The loader passes the bubble's color, so the chat is drawn in it before its settings load.
  const { color } = await searchParams;
  const initialColor = typeof color === "string" && WIDGET_COLOR_PATTERN.test(color) ? color : undefined;
  return <WidgetChatClient widgetKey={decodeURIComponent(key)} initialColor={initialColor} />;
}
