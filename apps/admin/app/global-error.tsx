"use client";

import dynamic from "next/dynamic";

// Every page downloads this file, the marketing site's included, so the error
// page and its translations load only when a root layout actually fails.
const ErrorPage = dynamic(() => import("@/components/error-page"));

export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="en"><body><ErrorPage {...props} /></body></html>;
}
