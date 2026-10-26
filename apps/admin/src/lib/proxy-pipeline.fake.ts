import { NextRequest } from "next/server";

import { proxy } from "../../proxy";

// Sends a request the way a visitor's browser does, through the real proxy and
// on to a route handler, so a route test sees what the proxy decided: its own
// answer when it answers first (a 404 for an unknown host, a 403 from the
// CSRF check), or the route's answer to the request headers the proxy passed
// on. A test that drives a brand lookup mocks @/lib/databases as usual.

type Handler = (request: Request) => Promise<Response>;

/** The request headers the proxy hands the route in place of the visitor's. */
export function forwardedRequestHeaders(response: Response): Headers {
  const forwarded = new Headers();
  for (const name of response.headers.get("x-middleware-override-headers")?.split(",") ?? []) {
    const value = response.headers.get(`x-middleware-request-${name}`);
    if (value !== null) forwarded.set(name, value);
  }
  return forwarded;
}

/**
 * The response to a request for `url` as a visitor sent it. The route gets the
 * request as the standalone server builds it, with the server's own address
 * in its URL, so only the proxy's headers can tell it where the visitor was.
 */
export async function throughProxy(handler: Handler, url: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {}): Promise<Response> {
  const passed = await proxy(new NextRequest(url, { ...(init.method ? { method: init.method } : {}), ...(init.headers ? { headers: init.headers } : {}) }));
  if (passed.headers.get("x-middleware-next") !== "1") return passed;
  const target = new URL(url);
  return await handler(new Request(`http://0.0.0.0:3000${target.pathname}${target.search}`, {
    ...(init.method ? { method: init.method } : {}),
    headers: forwardedRequestHeaders(passed),
    ...(init.body !== undefined ? { body: init.body } : {}),
  }));
}
