/**
 * Whether this build includes the marketing site. Dockerfile.admin leaves it
 * out unless the image is built with MARKETING_SITE=true, so self-hosted images
 * skip the pages, social cards and search index they never serve. Every other
 * build (pnpm build, CI, next dev) includes it. next.config.ts writes the
 * answer into the build as MARKETING_SITE_BUILT, so the server knows it too.
 */
export function marketingSiteBuilt(): boolean {
  return process.env.MARKETING_SITE_BUILT !== "false"
}

/** A marketing route's static params, or none when the build leaves the site out. */
export function marketingStaticParams<Params>(params: Params[]): Params[] {
  return marketingSiteBuilt() ? params : []
}
