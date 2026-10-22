import { createHmac, timingSafeEqual } from "node:crypto";

/** The Graph API version this adapter is written against. */
export const INSTAGRAM_GRAPH_VERSION = "v26.0";
/** What the receptionist needs: the account's name and ID, and its direct messages. */
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;
/** Instagram rejects a text message longer than this many UTF-8 bytes. */
export const INSTAGRAM_TEXT_LIMIT_BYTES = 1000;

const GRAPH = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`;
const REQUEST_TIMEOUT_MS = 15_000;

export type InstagramConfig = { appId: string; appSecret: string; redirectUri: string };

/**
 * A failed Instagram API call. `reconnectRequired` means the token no longer
 * works (OAuth error 190), so the account must be connected again.
 * `permanent` means retrying the same request won't help, for example a
 * message sent outside Instagram's 24-hour reply window.
 */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | undefined,
    readonly reconnectRequired: boolean,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; type?: string }; error_type?: string; code?: number; error_message?: string };

async function graphError(response: Response, action: string): Promise<InstagramApiError> {
  const body = await response.json().catch(() => ({})) as GraphError;
  const code = body.error?.code ?? body.code;
  const reconnectRequired = code === 190 || (body.error?.type === "OAuthException" && response.status === 401);
  // 4xx other than rate limits (code 4, 17, 32, 613) won't succeed on retry.
  const rateLimited = response.status === 429 || [4, 17, 32, 613].includes(code ?? -1);
  const permanent = reconnectRequired || (response.status >= 400 && response.status < 500 && !rateLimited);
  // Provider messages can quote request content, so only the action, status and code are kept.
  return new InstagramApiError(`Instagram ${action} failed with status ${response.status}${code !== undefined ? ` (code ${code})` : ""}.`, response.status, code, reconnectRequired, permanent);
}

/**
 * Splits a reply into pieces Instagram accepts, breaking at paragraph,
 * sentence or word boundaries where it can.
 */
export function splitInstagramText(text: string, limitBytes = INSTAGRAM_TEXT_LIMIT_BYTES): string[] {
  const bytes = (value: string) => Buffer.byteLength(value, "utf8");
  const parts: string[] = [];
  let rest = text.trim();
  while (rest && bytes(rest) > limitBytes) {
    // The longest prefix within the limit, counted in whole code points.
    let end = 0;
    let size = 0;
    for (const char of rest) {
      const charBytes = bytes(char);
      if (size + charBytes > limitBytes) break;
      size += charBytes;
      end += char.length;
    }
    const window = rest.slice(0, end);
    const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
    const cut = breakAt > end / 2 ? breakAt + 1 : window.lastIndexOf(" ") > end / 2 ? window.lastIndexOf(" ") : end;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Checks Meta's X-Hub-Signature-256 header: an HMAC-SHA256 of the raw body with the app secret. */
export function verifyInstagramWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export class InstagramProvider {
  constructor(private readonly config: InstagramConfig) {}

  buildAuthorizationUrl(input: { state: string }): string {
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
    url.searchParams.set("enable_fb_login", "false");
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  /** Swaps the authorization code for a short-lived token, then for a long-lived one (60 days). */
  async exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number; permissions: string[] }> {
    const response = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      // Instagram appends "#_" to the code in the redirect; it isn't part of it.
      body: new URLSearchParams({ client_id: this.config.appId, client_secret: this.config.appSecret, grant_type: "authorization_code", redirect_uri: this.config.redirectUri, code: code.replace(/#_$/, "") }),
    });
    if (!response.ok) throw await graphError(response, "token exchange");
    const payload = await response.json() as { access_token?: string; permissions?: string | string[]; data?: Array<{ access_token?: string; permissions?: string }> };
    const shortLived = payload.access_token ?? payload.data?.[0]?.access_token;
    if (!shortLived) throw new InstagramApiError("Instagram token exchange returned no token.", 502, undefined, false, false);
    const rawPermissions = payload.permissions ?? payload.data?.[0]?.permissions ?? "";
    const permissions = (Array.isArray(rawPermissions) ? rawPermissions : rawPermissions.split(",")).map((value) => value.trim()).filter(Boolean);
    const url = new URL("https://graph.instagram.com/access_token");
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", this.config.appSecret);
    url.searchParams.set("access_token", shortLived);
    const longLived = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!longLived.ok) throw await graphError(longLived, "long-lived token exchange");
    return { ...await this.readToken(longLived), permissions };
  }

  /** Extends a long-lived token by another 60 days. It must be at least a day old and not expired. */
  async refreshAccessToken(accessToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw await graphError(response, "token refresh");
    return await this.readToken(response);
  }

  /** The professional account's ID, the one Instagram's webhooks name, and its username. */
  async getAccount(accessToken: string): Promise<{ instagramUserId: string; username?: string }> {
    const url = new URL(`${GRAPH}/me`);
    url.searchParams.set("fields", "user_id,username");
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw await graphError(response, "account lookup");
    const payload = await response.json() as { user_id?: string | number; username?: string };
    if (payload.user_id === undefined || payload.user_id === "") throw new InstagramApiError("Instagram account lookup returned no account ID.", 502, undefined, false, false);
    return { instagramUserId: String(payload.user_id), ...(payload.username ? { username: payload.username } : {}) };
  }

  /** Turns on message webhooks for the account. Meta sends them to the app's configured callback URL. */
  async subscribeToMessages(input: { accessToken: string; instagramUserId: string }): Promise<void> {
    const url = new URL(`${GRAPH}/${encodeURIComponent(input.instagramUserId)}/subscribed_apps`);
    url.searchParams.set("subscribed_fields", "messages");
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${input.accessToken}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw await graphError(response, "webhook subscription");
  }

  /** Sends one text message, at most INSTAGRAM_TEXT_LIMIT_BYTES long. */
  async sendTextMessage(input: { accessToken: string; instagramUserId: string; recipientId: string; text: string }): Promise<{ messageId: string }> {
    const response = await fetch(`${GRAPH}/${encodeURIComponent(input.instagramUserId)}/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: input.recipientId }, message: { text: input.text } }),
    });
    if (!response.ok) throw await graphError(response, "message send");
    const payload = await response.json() as { message_id?: string };
    if (!payload.message_id) throw new InstagramApiError("Instagram message send returned no message ID.", 502, undefined, false, false);
    return { messageId: payload.message_id };
  }

  private async readToken(response: Response): Promise<{ accessToken: string; expiresIn: number }> {
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
      throw new InstagramApiError("Instagram returned an invalid token response.", 502, undefined, false, false);
    }
    return { accessToken: payload.access_token, expiresIn: payload.expires_in };
  }
}
