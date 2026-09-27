// The build hashes the versioned public files into this key (see asset-version.ts),
// so it changes whenever a translation or brand file changes.
const assetVersion = process.env.NEXT_PUBLIC_ASSET_VERSION ?? process.env.NEXT_PUBLIC_SERVICE_VERSION ?? "development";

export function versionedAssetUrl(pathname: string): string {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}v=${encodeURIComponent(assetVersion)}`;
}
