const serviceVersion = process.env.NEXT_PUBLIC_SERVICE_VERSION ?? "development";

export function versionedAssetUrl(pathname: string): string {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}v=${encodeURIComponent(serviceVersion)}`;
}
