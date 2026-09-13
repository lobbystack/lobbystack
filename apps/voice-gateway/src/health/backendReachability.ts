import { signedBackendHeaders } from "../backend/request";

export type BackendReachabilityResult =
  | { ok: true; status: number }
  | { ok: false; error: string; status?: number };

const DEFAULT_PROBE_TIMEOUT_MS = 1_000;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function probeBackendReachability(input: {
  backendUrl: string;
  internalServiceSecret: string;
  serviceId?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<BackendReachabilityResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  // The readiness endpoint authenticates an empty request body.
  const body = "";

  try {
    const response = await fetchFn(`${trimTrailingSlash(input.backendUrl)}/voice/ready`, {
      method: "GET",
      headers: signedBackendHeaders({
        serviceId: input.serviceId ?? "lobbystack-voice-gateway",
        secret: input.internalServiceSecret,
        body,
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS),
    });

    if (response.status === 200) {
      const ready = await response.json().catch(() => null);
      if (
        ready !== null &&
        typeof ready === "object" &&
        "ok" in ready &&
        "service" in ready &&
        "readiness" in ready &&
        ready.ok === true &&
        ready.service === "lobbystack-voice" &&
        ready.readiness === "ready"
      ) {
        return { ok: true, status: 200 };
      }

      return { ok: false, error: "invalid_readiness_response", status: 200 };
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
      // Network errors can include request URLs or credentials. Health responses stay generic.
      error: "backend_unreachable",
    };
  }
}
