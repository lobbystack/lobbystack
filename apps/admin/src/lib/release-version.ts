/**
 * Identifies the running build for telemetry, error tracking, and source maps.
 * Railway sets the commit SHA on every GitHub deploy, at build and at runtime,
 * so it wins over `SERVICE_VERSION`, which can stay unchanged across deploys.
 */
export function releaseVersion(env: Record<string, string | undefined> = process.env): string {
  return env.RAILWAY_GIT_COMMIT_SHA || env.RAILWAY_DEPLOYMENT_ID || env.SERVICE_VERSION || "development";
}
