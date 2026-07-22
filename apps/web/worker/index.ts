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

    const response = await env.ASSETS.fetch(request);
    const returnTo = url.searchParams.get("returnTo") ?? "";
    const hasSensitiveQuery =
      url.searchParams.has("token") ||
      url.searchParams.has("customer_session_token") ||
      /[?&]token=/i.test(returnTo);
    if (
      hasSensitiveQuery ||
      url.pathname === "/demo" ||
      url.pathname.startsWith("/demo/") ||
      url.pathname === "/claim-demo" ||
      url.pathname === "/confirm-email-change" ||
      url.pathname === "/accept-invite" ||
      url.pathname === "/login" ||
      url.pathname === "/signup"
    ) {
      const protectedResponse = new Response(response.body, response);
      protectedResponse.headers.set("Cache-Control", "no-store");
      protectedResponse.headers.set("Referrer-Policy", "no-referrer");
      return protectedResponse;
    }
    return response;
  },
};
