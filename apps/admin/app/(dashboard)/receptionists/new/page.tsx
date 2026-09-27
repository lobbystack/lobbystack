import { redirect } from "next/navigation";

import { NewReceptionistSurface } from "@/components/receptionists/new-receptionist-surface";
import { requireNewNavigation } from "@/lib/navigation-server";

export default async function NewReceptionistPage() {
  const navigation = await requireNewNavigation("/receptionists/new");
  if (!navigation.canManage) redirect("/");
  return <NewReceptionistSurface />;
}
