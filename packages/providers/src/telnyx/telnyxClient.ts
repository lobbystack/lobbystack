/** One error from a Telnyx API response, as `errors[]` lists it. */
export type TelnyxErrorDetail = { code?: string; title?: string; detail?: string };

/** A Telnyx API call that answered with an error status. `status` and `code` match what the worker checks on other providers' errors. */
export class TelnyxApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly errors: TelnyxErrorDetail[];

  constructor(status: number, errors: TelnyxErrorDetail[], path: string) {
    const first = errors[0];
    super(`Telnyx ${path} answered ${status}${first ? `: ${first.code ?? ""} ${first.title ?? ""}${first.detail ? ` (${first.detail})` : ""}`.trimEnd() : "."}`);
    this.name = "TelnyxApiError";
    this.status = status;
    this.code = first?.code;
    this.errors = errors;
  }
}

export type TelnyxQuery = Record<string, string | number | boolean | string[] | undefined>;

type Fetch = typeof fetch;

/**
 * A small client for the Telnyx v2 REST API. Query keys are passed as
 * Telnyx writes them, such as `filter[country_code]`, and an array value
 * repeats the key, as `filter[features][]` needs.
 */
export class TelnyxClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetch: Fetch;

  constructor(config: { apiKey: string; baseUrl?: string; fetch?: Fetch }) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://api.telnyx.com/v2").replace(/\/$/, "");
    this.fetch = config.fetch ?? fetch;
  }

  get<T>(path: string, query?: TelnyxQuery): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, { body, headers });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path, {});
  }

  private async request<T>(method: string, path: string, options: { query?: TelnyxQuery | undefined; body?: unknown; headers?: Record<string, string> | undefined }): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
    const response = await this.fetch(url, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, accept: "application/json", ...(options.body !== undefined ? { "content-type": "application/json" } : {}), ...options.headers },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const text = await response.text();
    // An error from a proxy or an outage page may not be JSON, and it still has to keep its status.
    let json: unknown = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (error) {
        if (!response.ok) throw new TelnyxApiError(response.status, [], path);
        throw new Error(`Telnyx ${path} answered ${response.status} with a body that isn't JSON.`, { cause: error });
      }
    }
    if (!response.ok) throw new TelnyxApiError(response.status, Array.isArray((json as { errors?: unknown } | null)?.errors) ? (json as { errors: TelnyxErrorDetail[] }).errors : [], path);
    return json as T;
  }
}

/** E.164 in a URL path: Telnyx wants the leading + encoded. */
export function telnyxPathNumber(e164: string): string {
  return encodeURIComponent(e164);
}
