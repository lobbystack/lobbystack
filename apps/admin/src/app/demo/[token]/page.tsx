"use client";

import { use } from "react";

import { ProspectDemoPage } from "@/features/demos/ProspectDemoPage";

export default function DemoTokenRoutePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <ProspectDemoPage />;
}
