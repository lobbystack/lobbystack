"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

export function truncateId(value: string, maxLength = 16): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

/** Copies text and remembers which field was copied for 1.5 seconds. */
export function useCopiedField() {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  function copy(text: string, field: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1_500);
    });
  }
  return { copiedField, copy };
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link className="type-body-muted inline-flex w-fit items-center gap-1.5 transition-colors hover:text-foreground" href={href}><ArrowLeft className="size-4" />{label}</Link>;
}

export function DetailSection({ children, className, title }: { children: React.ReactNode; className?: string; title: string }) {
  return <section className={cn("flex flex-col gap-4 px-4 py-4", className)}><h3 className="font-heading text-base font-medium">{title}</h3>{children}</section>;
}

export function MetadataField({ copied, copyLabel, label, maskValue, onCopy, value }: { copied?: boolean; copyLabel?: string; label: string; maskValue?: boolean; onCopy?: () => void; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="type-meta">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn("type-body truncate", maskValue && "ph-mask")}>{value}</span>
        {onCopy ? <button aria-label={copyLabel} className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground", copied && "text-emerald-500")} onClick={onCopy} type="button">{copied ? <CheckCircle2 className="size-3" /> : <Copy className="size-3" />}</button> : null}
      </div>
    </div>
  );
}
