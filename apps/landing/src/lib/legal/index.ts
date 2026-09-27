import type { Locale } from "@/i18n/config"
import { privacyEn } from "./privacy-en"
import { privacyFr } from "./privacy-fr"
import { termsEn } from "./terms-en"
import { termsFr } from "./terms-fr"
import type { LegalDocument } from "./types"

export type LegalKind = "privacy" | "terms"

export type { LegalBlock, LegalDocument, LegalSection } from "./types"

export const legalDocuments: Record<LegalKind, Record<Locale, LegalDocument>> =
  {
    privacy: { en: privacyEn, fr: privacyFr },
    terms: { en: termsEn, fr: termsFr },
  }

export const getLegalDocument = (kind: LegalKind, locale: Locale) =>
  legalDocuments[kind][locale]
