const PROSPECT_DEMO_TOKEN_STORAGE_KEY = "lobbystack.prospectDemo.token";
const PROSPECT_DEMO_TOKEN_FRAGMENT_PARAM = "prospect_demo_token";

let prospectDemoTokenMemory: string | null = null;

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeProspectDemoToken(token: string): void {
  const normalized = token.trim();
  if (!normalized) {
    return;
  }
  prospectDemoTokenMemory = normalized;
  try {
    getSessionStorage()?.setItem(PROSPECT_DEMO_TOKEN_STORAGE_KEY, normalized);
  } catch {
    // Memory keeps the token available for this page load when storage is blocked.
  }
}

export function getStoredProspectDemoToken(): string | null {
  if (prospectDemoTokenMemory) {
    return prospectDemoTokenMemory;
  }
  try {
    return getSessionStorage()?.getItem(PROSPECT_DEMO_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function clearStoredProspectDemoToken(): void {
  prospectDemoTokenMemory = null;
  try {
    getSessionStorage()?.removeItem(PROSPECT_DEMO_TOKEN_STORAGE_KEY);
  } catch {
    // Nothing else to clear when storage is unavailable.
  }
}

function takeTokenFromHash(url: URL): string | null {
  const hashParams = new URLSearchParams(url.hash.slice(1));
  const token = hashParams.get(PROSPECT_DEMO_TOKEN_FRAGMENT_PARAM)?.trim() ?? "";
  if (!token) {
    return null;
  }
  hashParams.delete(PROSPECT_DEMO_TOKEN_FRAGMENT_PARAM);
  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : "";
  return token;
}

function takeLegacyDemoPathToken(url: URL): string | null {
  const match = url.pathname.match(/^\/demo\/([^/]+)\/?$/i);
  if (!match?.[1]) {
    return null;
  }
  url.pathname = "/demo";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function takeClaimQueryToken(url: URL): string | null {
  if (url.pathname !== "/claim-demo") {
    return null;
  }
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (token) {
    url.searchParams.delete("token");
  }
  return token || null;
}

function takeNestedClaimToken(url: URL): string | null {
  const returnTo = url.searchParams.get("returnTo");
  if (!returnTo) {
    return null;
  }
  try {
    const nested = new URL(returnTo, "https://lobbystack.local");
    if (nested.pathname !== "/claim-demo") {
      return null;
    }
    const token = nested.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      return null;
    }
    nested.searchParams.delete("token");
    url.searchParams.set(
      "returnTo",
      `${nested.pathname}${nested.search}${nested.hash}`,
    );
    return token;
  } catch {
    return null;
  }
}

export function scrubProspectDemoTokenFromLocation(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const original = `${url.pathname}${url.search}${url.hash}`;
  const tokens = [
    takeTokenFromHash(url),
    takeLegacyDemoPathToken(url),
    takeClaimQueryToken(url),
    takeNestedClaimToken(url),
  ];
  const token = tokens.find((candidate) => candidate !== null) ?? null;
  if (token) {
    storeProspectDemoToken(token);
  }

  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next !== original) {
    window.history.replaceState(window.history.state, "", next);
  }
}
