// MCP clients that run in a browser (the MCP Inspector, for example) call the
// OAuth token, registration and revocation endpoints cross-origin. Those
// endpoints authenticate with the request body (PKCE verifier, client
// credentials or the token itself), never with cookies, so they allow any
// origin without credentials. Every other auth endpoint keeps the default
// same-origin behavior.

const OAUTH_CLIENT_PATHS = new Set(["/api/auth/oauth2/token", "/api/auth/oauth2/register", "/api/auth/oauth2/revoke"]);

export function isOAuthClientEndpoint(request: Request): boolean {
  return OAUTH_CLIENT_PATHS.has(new URL(request.url).pathname);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, dpop, mcp-protocol-version",
};

export function withOAuthClientCors(request: Request, response: Response): Response {
  if (!isOAuthClientEndpoint(request)) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  // Never let a browser attach cookies set by these endpoints to a cross-origin caller.
  headers.delete("set-cookie");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function oauthClientPreflight(request: Request): Response {
  if (!isOAuthClientEndpoint(request)) return new Response(null, { status: 404 });
  return new Response(null, { status: 204, headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" } });
}
