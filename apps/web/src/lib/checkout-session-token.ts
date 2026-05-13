export const CHECKOUT_CUSTOMER_SESSION_TOKEN_PARAM = "customer_session_token";

const CHECKOUT_CUSTOMER_SESSION_TOKEN_STORAGE_KEY =
  "lobbystack.checkout.customerSessionToken";

let checkoutSessionTokenMemory: string | null = null;

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeCheckoutSessionToken(token: string): void {
  checkoutSessionTokenMemory = token;

  try {
    getSessionStorage()?.setItem(CHECKOUT_CUSTOMER_SESSION_TOKEN_STORAGE_KEY, token);
  } catch {
    // Memory fallback keeps the token available for this page load without
    // leaving it in the URL or analytics payloads.
  }
}

export function getStoredCheckoutSessionToken(): string | null {
  if (checkoutSessionTokenMemory) {
    return checkoutSessionTokenMemory;
  }

  try {
    return getSessionStorage()?.getItem(CHECKOUT_CUSTOMER_SESSION_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function clearStoredCheckoutSessionToken(): void {
  checkoutSessionTokenMemory = null;

  try {
    getSessionStorage()?.removeItem(CHECKOUT_CUSTOMER_SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Nothing else to clear when storage is unavailable.
  }
}

export function takeCheckoutSessionToken(searchParams: URLSearchParams): string | null {
  const token = searchParams.get(CHECKOUT_CUSTOMER_SESSION_TOKEN_PARAM);
  if (token) {
    storeCheckoutSessionToken(token);
    return token;
  }

  return getStoredCheckoutSessionToken();
}

export function deleteCheckoutSessionTokenParam(
  searchParams: URLSearchParams,
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete(CHECKOUT_CUSTOMER_SESSION_TOKEN_PARAM);
  return nextSearchParams;
}

export function scrubCheckoutSessionTokenFromLocation(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const token = url.searchParams.get(CHECKOUT_CUSTOMER_SESSION_TOKEN_PARAM);
  if (!token) {
    return;
  }

  storeCheckoutSessionToken(token);
  url.searchParams.delete(CHECKOUT_CUSTOMER_SESSION_TOKEN_PARAM);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}
