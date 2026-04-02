import { inferOnboardingLocationContext } from "../../../convex/lib/onboardingLocation";

type Env = {
  ASSETS: Fetcher;
  POSTHOG_PROXY_TARGET?: string;
};

const POSTHOG_PROXY_PREFIX = "/ingest/posthog";
const DEFAULT_POSTHOG_PROXY_TARGET = "https://us.i.posthog.com";

function buildPostHogProxyUrl(requestUrl: URL, targetOrigin: string): URL {
  const upstreamPath =
    requestUrl.pathname === POSTHOG_PROXY_PREFIX
      ? "/"
      : requestUrl.pathname.slice(POSTHOG_PROXY_PREFIX.length);
  return new URL(`${upstreamPath}${requestUrl.search}`, targetOrigin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname === POSTHOG_PROXY_PREFIX ||
      url.pathname.startsWith(`${POSTHOG_PROXY_PREFIX}/`)
    ) {
      const targetOrigin = env.POSTHOG_PROXY_TARGET ?? DEFAULT_POSTHOG_PROXY_TARGET;
      const proxyUrl = buildPostHogProxyUrl(url, targetOrigin);
      return fetch(new Request(proxyUrl.toString(), request));
    }

    if (url.pathname === "/onboarding/location") {
      const timezoneHint = url.searchParams.get("timezone")?.trim() || undefined;
      const context = await inferOnboardingLocationContext({
        request,
        ...(timezoneHint ? { timezoneHint } : {}),
      });

      return Response.json(context, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
