import { GuestAuthCard } from "@/components/guest-auth-card";

/** White Label's sign-in, on the host's domain. It opens the partner console. */
export default function PartnerLoginPage() {
  return <GuestAuthCard mode="login" partner={{ returnTo: "/partner" }} />;
}
