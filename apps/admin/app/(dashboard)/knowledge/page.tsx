import { KnowledgeSurface } from "@/components/receptionists/business-surfaces";
import { requireNewNavigation } from "@/lib/navigation-server";

export default async function KnowledgePage() {
  await requireNewNavigation("/knowledge");
  return <KnowledgeSurface />;
}
