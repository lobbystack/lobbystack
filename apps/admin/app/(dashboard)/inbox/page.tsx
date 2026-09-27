import { Suspense } from "react";

import { InboxSurface } from "@/components/receptionists/business-surfaces";
import { requireNewNavigation } from "@/lib/navigation-server";

export default async function InboxPage() {
  await requireNewNavigation("/inbox");
  return <Suspense><InboxSurface /></Suspense>;
}
