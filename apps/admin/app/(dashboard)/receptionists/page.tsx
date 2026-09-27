import { redirect } from "next/navigation";

import { defaultReceptionist, receptionistPath } from "@/lib/navigation-routes";
import { requireNewNavigation } from "@/lib/navigation-server";

export default async function ReceptionistsPage() {
  const navigation = await requireNewNavigation("/receptionists");
  const receptionist = defaultReceptionist(navigation.receptionists);
  redirect(receptionist ? receptionistPath(receptionist.id) : "/");
}
