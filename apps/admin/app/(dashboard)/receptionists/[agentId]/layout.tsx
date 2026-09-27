import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PATHNAME_HEADER } from "@/lib/locale-request";
import { defaultReceptionist, parseReceptionistPath, receptionistPath } from "@/lib/navigation-routes";
import { requireNewNavigation } from "@/lib/navigation-server";

/**
 * Receptionist pages exist only in the new navigation. A link to a deleted or
 * foreign receptionist lands on the same page of the default receptionist.
 */
export default async function ReceptionistLayout({ children, params }: { children: React.ReactNode; params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? `/receptionists/${agentId}`;
  const navigation = await requireNewNavigation(pathname);
  if (!navigation.receptionists.some((receptionist) => receptionist.id === agentId)) {
    const fallback = defaultReceptionist(navigation.receptionists);
    redirect(fallback ? receptionistPath(fallback.id, parseReceptionistPath(pathname)?.section ?? "overview") : "/");
  }
  return children;
}
