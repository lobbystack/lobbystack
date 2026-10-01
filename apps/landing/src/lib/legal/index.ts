import type { Locale } from "@/i18n/config"
import { privacyEn } from "./privacy-en"
import { privacyEs } from "./privacy-es"
import { privacyFr } from "./privacy-fr"
import { privacySr } from "./privacy-sr"
import { termsEn } from "./terms-en"
import { termsEs } from "./terms-es"
import { termsFr } from "./terms-fr"
import { termsSr } from "./terms-sr"
import type { LegalDocument } from "./types"

export type LegalKind = "privacy" | "terms"

export type { LegalBlock, LegalDocument, LegalSection } from "./types"

export const legalDocuments: Record<
  LegalKind,
  Record<Locale, LegalDocument>
> = {
  privacy: { en: privacyEn, fr: privacyFr, es: privacyEs, sr: privacySr },
  terms: { en: termsEn, fr: termsFr, es: termsEs, sr: termsSr },
}

export const getLegalDocument = (kind: LegalKind, locale: Locale) =>
  legalDocuments[kind][locale]
