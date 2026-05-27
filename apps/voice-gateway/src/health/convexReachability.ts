export type ConvexReachabilityResult =
  | { ok: true; status: number }
  | { ok: false; error: string; status?: number };

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function probeConvexSiteReachability(input: {
  convexSiteUrl: string;
  internalServiceToken: string;
  fetchImpl?: typeof fetch;
}): Promise<ConvexReachabilityResult> {
  const fetchFn = input.fetchImpl ?? fetch;

  try {
    const response = await fetchFn(`${trimTrailingSlash(input.convexSiteUrl)}/voice/context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-service-token": input.internalServiceToken,
      },
      body: JSON.stringify({
        phoneNumber: "+15555550100",
        channel: "voice",
      }),
    });

    if (response.ok || response.status === 404) {
      return { ok: true, status: response.status };
    }

    if (response.status === 401) {
      return {
        ok: false,
        error: "internal_service_token_mismatch",
        status: 401,
      };
    }

    return {
      ok: false,
      error: "unexpected_status",
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
