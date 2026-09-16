"use client";

import ErrorPage from "./error";
import { getFallbackI18n } from "@/i18n";

export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang={getFallbackI18n().resolvedLanguage ?? "en"}><body><ErrorPage {...props} /></body></html>;
}
