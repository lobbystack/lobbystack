export function webCallConnectSource(
  source: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const endpoint = source.NEXT_PUBLIC_WEB_CALL_ENDPOINT?.trim();
  if (!endpoint) return undefined;

  try {
    return new URL(endpoint).origin;
  } catch {
    return undefined;
  }
}
