import { BillingSuccessSurface } from "@/components/billing-success-surface";

// Lives beside onboarding, whose layout only needs a session, because both an
// onboarding checkout and a settings checkout return here.
export default function BillingSuccessPage() { return <BillingSuccessSurface />; }
