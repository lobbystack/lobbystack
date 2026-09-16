import { WidgetChatClient } from "@/components/widget/widget-chat-client";

// The root layout negotiates the request locale; widget keys are runtime data.
export const dynamic = "force-dynamic";

export default async function WidgetEmbedPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!key) return null;
  return <WidgetChatClient widgetKey={decodeURIComponent(key)} />;
}
