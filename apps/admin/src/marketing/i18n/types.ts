import type { Locale } from "@/marketing/i18n/config"

export type FaqItem = {
  question: string
  answer: string
}

export type LocalizedSeo = {
  title: string
  description: string
}

export type RouteDefinition = {
  path: string
  localized: boolean
}

export type LandingMessages = {
  common: {
    home: string
    tryFree: string
    viewPricing: string
    seePricing: string
    startFree: string
    contactUs: string
    noCreditCard: string
    cancelAnytime: string
    noCreditCardCancelAnytime: string
    commonQuestions: string
    relatedResources: string
    featured: string
    latestBlogPosts: string
    productResources: string
    readComparison: string
    viewSolution: string
    seeFullFeatureList: string
  }
  /** The cards that copy a prompt for an AI assistant. The prompts themselves stay in English. */
  setupPrompts: {
    title: string
    intro: string
    copy: string
    copied: string
    blocked: string
  }
  routes: Record<string, LocalizedSeo>
}

export type LocalizedCatalog = Record<Locale, LandingMessages>

