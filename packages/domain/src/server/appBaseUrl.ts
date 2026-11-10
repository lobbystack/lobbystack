/** The dashboard's origin, from APP_BASE_URL without a trailing slash, for links the domain writes into emails. */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL?.trim() || "http://localhost").replace(/\/$/, "");
}
