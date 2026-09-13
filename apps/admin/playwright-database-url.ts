export function roleDatabaseUrl(baseUrl: URL, role: string, password: string, explicitUrl?: string): string {
  if (explicitUrl) return explicitUrl;
  const url = new URL(baseUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}
