import { redirect } from "next/navigation";

import { StaffSurface } from "@/components/receptionists/business-surfaces";
import { requireNewNavigation } from "@/lib/navigation-server";

export default async function StaffPage() {
  const navigation = await requireNewNavigation("/staff");
  // Staff stays out of the way until the business turns it on.
  if (!navigation.staffEnabled) redirect("/services");
  return <StaffSurface />;
}
