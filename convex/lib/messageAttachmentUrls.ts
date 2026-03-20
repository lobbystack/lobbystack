function requireConvexSiteUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL is required for attachment delivery.");
  }

  return siteUrl;
}

export function buildMessageAttachmentDownloadUrl(nonce: string): string {
  const url = new URL("/messages/attachments/download", requireConvexSiteUrl());
  url.searchParams.set("token", nonce);
  return url.toString();
}
