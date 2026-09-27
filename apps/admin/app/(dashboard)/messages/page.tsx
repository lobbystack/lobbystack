import { LiveMessagesSurface } from "@/components/live-messages-surface";
import { redirectLegacyPage, searchString } from "@/lib/navigation-server";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await redirectLegacyPage("/messages", searchString(await searchParams));
  return <LiveMessagesSurface />;
}
