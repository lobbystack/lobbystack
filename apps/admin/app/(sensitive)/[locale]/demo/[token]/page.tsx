import type { Metadata } from "next";
import { DemoTokenCompatibilityRoute } from "@/components/demo-token-compatibility-route";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function DemoTokenPage() { return <DemoTokenCompatibilityRoute />; }
