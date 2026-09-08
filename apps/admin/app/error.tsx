"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { captureBrowserError } from "@/lib/browser-error-reporting";
import "@/i18n";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useTranslation("common");
  useEffect(() => { captureBrowserError(error); }, [error]);
  return <main role="alert" className="p-8"><h1>{t("errors.unexpected")}</h1><button onClick={retry}>{t("loading.retry")}</button></main>;
}
