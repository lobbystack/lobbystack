/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_POSTHOG_ENABLED?: string
  readonly PUBLIC_POSTHOG_KEY?: string
  readonly PUBLIC_POSTHOG_HOST?: string
  readonly PUBLIC_POSTHOG_UI_HOST?: string
  readonly PUBLIC_WEB_CALL_ENDPOINT?: string
  readonly PUBLIC_WEB_CALL_BUSINESS_SLUG?: string
  readonly INDEXNOW_KEY?: string
  readonly GOOGLE_SITE_VERIFICATION?: string
  readonly BING_SITE_VERIFICATION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
