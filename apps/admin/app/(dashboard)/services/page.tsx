import { ServicesSurface } from "@/components/receptionists/business-surfaces";
import { requireNewNavigation } from "@/lib/navigation-server";

export default async function ServicesPage() {
  await requireNewNavigation("/services");
  return <ServicesSurface />;
}
