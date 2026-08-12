import { loadVoiceGatewayEnv } from "@lobbystack/config";
import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";

import { signedBackendHeaders } from "../backend/request";
import { withSpan } from "@lobbystack/telemetry/node";

type VoiceContextResponse = {
  businessId: string;
  snapshot: BusinessContextSnapshot;
};

export async function fetchSnapshotForPhoneNumber(
  phoneNumber: string,
): Promise<BusinessContextSnapshot> {
  const env = loadVoiceGatewayEnv(process.env);

  try {
    const serialized = JSON.stringify({ phoneNumber, channel: "voice" });
    const response = await withSpan("voice.backend.context", { attributes: { "http.request.method": "POST", "url.path": "/voice/context" } }, async () => await fetch(`${env.BACKEND_INTERNAL_URL ?? env.CONVEX_SITE_URL!}/voice/context`, {
      method: "POST",
      headers: signedBackendHeaders({ serviceId: process.env.VOICE_GATEWAY_SERVICE_ID ?? "lobbystack-voice-gateway", secret: env.INTERNAL_SERVICE_SECRET ?? env.INTERNAL_SERVICE_TOKEN, body: serialized }),
      body: serialized,
    }));

    if (!response.ok) {
      throw new Error(`Backend voice context lookup failed with ${response.status}.`);
    }

    const payload = (await response.json()) as VoiceContextResponse;
    return payload.snapshot;
  } catch (error) {
    if (env.DEPLOYMENT_MODE === "development" && env.NODE_ENV !== "production") {
      console.warn("[voice-gateway] Falling back to demo snapshot.", error);
      return demoSnapshot;
    }
    throw error;
  }
}
