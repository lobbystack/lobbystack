import { NumbersSurface } from "@/components/receptionists/business-surfaces";
import { requireNewNavigation } from "@/lib/navigation-server";

export default async function NumbersPage() {
  await requireNewNavigation("/numbers");
  return <NumbersSurface />;
}
