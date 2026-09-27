"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shows a secret that the server returns only once, with a copy button. */
export function SecretReveal({ value, warning }: { value: string; warning: string }) {
  const { t } = useTranslation("settings");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-2">
        <code className="min-w-0 flex-1 break-all px-2 font-mono text-sm" data-testid="secret-value">{value}</code>
        <Button
          aria-label={t("secretReveal.copy")}
          onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); }}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? t("secretReveal.copied") : t("secretReveal.copy")}
        </Button>
      </div>
      <Alert><AlertDescription>{warning}</AlertDescription></Alert>
    </div>
  );
}
