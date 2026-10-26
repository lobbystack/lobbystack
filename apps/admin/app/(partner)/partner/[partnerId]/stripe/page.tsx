import { Suspense } from "react";

import { PartnerStripeSurface } from "@/components/partner-stripe-surface";

// The surface reads ?onboarding= from the URL Stripe sends the owner back to.
export default function PartnerStripePage() { return <Suspense><PartnerStripeSurface /></Suspense>; }
