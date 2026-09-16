import type { Metadata } from "next";
import { DemoSurface } from "@/components/demo-surface";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function DemoPage() { return <DemoSurface />; }
