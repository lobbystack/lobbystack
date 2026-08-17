import { WidgetChatClient } from "@/components/widget/widget-chat-client";

export function generateStaticParams(): never[] {
  return [];
}

export default async function WidgetEmbedPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!key) return null;
  return <WidgetChatClient widgetKey={decodeURIComponent(key)} />;
}
