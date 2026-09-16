const WEB_CALL_SESSION_PATH = "/web-call/sessions";

export function resolveWebCallEndpoint(configuredEndpoint: string | undefined, nodeEnv: string | undefined): string {
  const fallback = nodeEnv === "production"
    ? "https://voice.lobbystack.com/web-call/sessions"
    : "http://127.0.0.1:3001/web-call/sessions";
  const candidate = configuredEndpoint?.trim() || fallback;

  try {
    const url = new URL(candidate);
    if (url.pathname === "/") url.pathname = WEB_CALL_SESSION_PATH;
    return url.toString().replace(/\/$/, "");
  } catch {
    return candidate.replace(/\/$/, "");
  }
}

export const webCallEndpoint = resolveWebCallEndpoint(
  process.env.NEXT_PUBLIC_WEB_CALL_ENDPOINT,
  process.env.NODE_ENV,
);
