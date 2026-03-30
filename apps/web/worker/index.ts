import { inferOnboardingLocationContext } from "../../../convex/lib/onboardingLocation";

type Env = {
  ASSETS: Fetcher;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
