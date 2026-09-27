import { LiveCallsSurface } from "@/components/live-calls-surface";
import { redirectLegacyPage, searchString } from "@/lib/navigation-server";

export default async function CallsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await redirectLegacyPage("/calls", searchString(await searchParams));
  return <LiveCallsSurface />;
}
