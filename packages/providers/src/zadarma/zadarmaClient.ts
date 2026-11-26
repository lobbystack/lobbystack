import { createHash, createHmac } from "node:crypto";

/** A Zadarma API call that answered with an error: an error status, or `"status": "error"` with its `message`. */
export class ZadarmaApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string | undefined, path: string) {
    super(`Zadarma ${path} answered ${status}${message ? `: ${message}` : "."}`);
    this.name = "ZadarmaApiError";
    this.status = status;
  }
}

export type ZadarmaParams = Record<string, string | number | boolean | undefined>;

type Fetch = typeof fetch;

/** PHP's urlencode, which Zadarma signs with: everything but letters, digits and -_. is escaped, and a space is a plus. */
function urlencode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%20/g, "+");
}

/** The parameters as Zadarma reads them, sorted by key, such as `direction_id=3766&format=json`. */
export function zadarmaParamString(params: Record<string, string>): string {
  return Object.keys(params).sort().map((key) => `${urlencode(key)}=${urlencode(params[key]!)}`).join("&");
}

/**
 * The Authorization signature: base64 of the hex digest of HMAC-SHA1 over the method path, the parameter string and
 * the MD5 of the parameter string. The hex text is what gets encoded, not the raw digest, as in Zadarma's own clients.
 */
export function zadarmaSignature(input: { method: string; params: Record<string, string>; secret: string }): string {
  const paramString = zadarmaParamString(input.params);
  const signed = `${input.method}${paramString}${createHash("md5").update(paramString).digest("hex")}`;
  return Buffer.from(createHmac("sha1", input.secret).update(signed).digest("hex")).toString("base64");
}

/**
 * A small client for the Zadarma v1 API. The method path is signed exactly as it is sent, including its trailing
 * slash. Every request carries `format=json`, which Zadarma's own clients sign too. GET sends the parameters in the
 * query, and POST and PUT send them as a form.
 */
export class ZadarmaClient {
  private readonly key: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly fetch: Fetch;

  constructor(config: { key: string; secret: string; baseUrl?: string; fetch?: Fetch }) {
    this.key = config.key;
    this.secret = config.secret;
    this.baseUrl = (config.baseUrl ?? "https://api.zadarma.com").replace(/\/$/, "");
    this.fetch = config.fetch ?? fetch;
  }

  get<T>(path: string, params?: ZadarmaParams): Promise<T> {
    return this.request<T>("GET", path, params);
  }

  post<T>(path: string, params?: ZadarmaParams): Promise<T> {
    return this.request<T>("POST", path, params);
  }

  put<T>(path: string, params?: ZadarmaParams): Promise<T> {
    return this.request<T>("PUT", path, params);
  }

  private async request<T>(method: "GET" | "POST" | "PUT", path: string, params: ZadarmaParams = {}): Promise<T> {
    const sent: Record<string, string> = { format: "json" };
    for (const [name, value] of Object.entries(params)) if (value !== undefined) sent[name] = String(value);
    const authorization = `${this.key}:${zadarmaSignature({ method: path, params: sent, secret: this.secret })}`;
    const paramString = zadarmaParamString(sent);
    const response = await this.fetch(method === "GET" ? `${this.baseUrl}${path}?${paramString}` : `${this.baseUrl}${path}`, {
      method,
      headers: { authorization, accept: "application/json", ...(method === "GET" ? {} : { "content-type": "application/x-www-form-urlencoded" }) },
      ...(method === "GET" ? {} : { body: paramString }),
    });
    const text = await response.text();
    // An error from a proxy or an outage page may not be JSON, and it still has to keep its status.
    let json: unknown = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (error) {
        if (!response.ok) throw new ZadarmaApiError(response.status, undefined, path);
        throw new Error(`Zadarma ${path} answered ${response.status} with a body that isn't JSON.`, { cause: error });
      }
    }
    const body = (json && typeof json === "object" ? json : {}) as { status?: unknown; message?: unknown };
    const message = typeof body.message === "string" ? body.message : undefined;
    if (!response.ok || body.status === "error") throw new ZadarmaApiError(response.ok ? 400 : response.status, message, path);
    return json as T;
  }
}
