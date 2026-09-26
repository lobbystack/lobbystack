import { notFound } from "next/navigation";

import { LivePrototypeSurface } from "@/components/live-prototype-surface";

export const dynamic = "force-dynamic";

export default function LivePrototypePage() {
  if (process.env.LIVE_PROTOTYPE_ENABLED !== "true") notFound();
  return <LivePrototypeSurface />;
}
