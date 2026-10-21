import { readFile } from "node:fs/promises";
import path from "node:path";

import { WIDGET_APPEARANCE_GLOBAL } from "@lobbystack/shared";

import { loadWidgetAppearance, requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetLoaderRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";

const STUB = "/* LobbyStack widget loader is unavailable. Run `pnpm --filter @lobbystack/embed build`. */";
const EMBED_FILE = path.join(process.cwd(), "public", "embed", "embed.js");
// Every widget key is "wk_live_" and 24 random bytes in base64url (insertWidgetKeyInTransaction in packages/domain). Anything else is not a key.
const WIDGET_KEY_PATTERN = /^wk_live_[A-Za-z0-9_-]{32}$/;

const PLAIN_CACHE = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";
// A keyed loader carries the saved look, so it may only be cached briefly.
const KEYED_CACHE = "public, max-age=60, s-maxage=60";
// A keyed loader that skipped its lookup: the visitor's browser may keep it briefly, but a CDN mustn't serve it to everyone.
const LOOKUP_SKIPPED = { prelude: "", cacheControl: "private, max-age=60" };

/**
 * With `?key=`, the loader starts by recording the bubble look the dashboard
 * saved for that key, so a change there reaches the website without a new
 * snippet. A malformed key, a failed lookup, or a client past its lookup limit
 * gets the plain loader, which falls back to the script tag's attributes.
 */
async function keyedLoaderStart(request: Request, key: string | null): Promise<{ prelude: string; cacheControl: string }> {
  if (key === null) return { prelude: "", cacheControl: PLAIN_CACHE };
  if (!WIDGET_KEY_PATTERN.test(key)) return { prelude: "", cacheControl: PLAIN_CACHE };
  const ipHash = requestIpHash(request);
  const rate = await enforceWidgetLoaderRateLimits(ipHash ? { ipHash } : {});
  if (!rate.allowed) return LOOKUP_SKIPPED;
  const appearance = await loadWidgetAppearance(key);
  if (!appearance) return { prelude: "", cacheControl: KEYED_CACHE };
  const global = `window[${JSON.stringify(WIDGET_APPEARANCE_GLOBAL)}]`;
  return { prelude: `${global}=${global}||{};${global}[${JSON.stringify(key)}]=${JSON.stringify(appearance)};\n`, cacheControl: KEYED_CACHE };
}

export async function GET(request: Request) {
  let body: string;
  try {
    body = await readFile(EMBED_FILE, "utf8");
  } catch {
    // The generated asset is copied into public/embed during the build.
    return new Response(STUB, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=60",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const start = await keyedLoaderStart(request, new URL(request.url).searchParams.get("key")).catch(() => LOOKUP_SKIPPED);
  return new Response(`${start.prelude}${body}`, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": start.cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}
