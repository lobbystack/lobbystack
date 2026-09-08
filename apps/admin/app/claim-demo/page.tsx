import type { Metadata } from "next";
import { ClaimDemoSurface } from "@/components/claim-demo-surface";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ClaimDemoPage() { return <ClaimDemoSurface />; }
