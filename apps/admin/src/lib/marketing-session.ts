import { marketingHosts } from "@/marketing/routing";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The marketing site's origin when `origin` is one of the hosts in
 * `MARKETING_HOSTS`: over https, or over http for a `.localhost` name, which
 * only ever reaches this machine. Any other origin gets null.
 */
export function marketingSiteOrigin(origin: string | null, env: Env = process.env): string | null {
  if (!origin) return null;
  const hosts = marketingHosts(env);
  if (!hosts) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  const secure = url.protocol === "https:" || (url.protocol === "http:" && hostname.endsWith(".localhost"));
  if (!secure || url.origin !== origin) return null;
  return hostname === hosts.canonical || hosts.aliases.has(hostname) ? url.origin : null;
}

/**
 * Tells the marketing site whether its visitor is signed in to the dashboard,
 * and nothing else about the session. The site runs on a sibling host
 * (lobbystack.com beside app.lobbystack.com), so the browser sends the
 * dashboard's session cookie with the site's credentialed request, and only
 * the marketing hosts may read the answer.
 */
export async function marketingSessionResponse(
  request: Request,
  isSignedIn: (headers: Headers) => Promise<boolean>,
  env: Env = process.env,
): Promise<Response> {
  const origin = marketingSiteOrigin(request.headers.get("origin"), env);
  const headers: Record<string, string> = { "cache-control": "private, no-store", vary: "origin" };
  if (!origin) return new Response(null, { status: 403, headers });
  const signedIn = await isSignedIn(request.headers).catch(() => false);
  return Response.json(
    { signedIn },
    {
      headers: {
        ...headers,
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
      },
    },
  );
}
