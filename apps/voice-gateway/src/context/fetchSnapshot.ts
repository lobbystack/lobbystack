import { loadVoiceGatewayEnv } from "@lobbystack/config";
import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";

type VoiceContextResponse = {
  businessId: string;
  snapshot: BusinessContextSnapshot;
};

export async function fetchSnapshotForPhoneNumber(
  phoneNumber: string,
): Promise<BusinessContextSnapshot> {
  const env = loadVoiceGatewayEnv(process.env);

  try {
    const response = await fetch(`${env.CONVEX_SITE_URL}/voice/context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({ phoneNumber, channel: "voice" }),
    });

    if (!response.ok) {
      throw new Error(`Convex voice context lookup failed with ${response.status}.`);
    }

    const payload = (await response.json()) as VoiceContextResponse;
    return payload.snapshot;
  } catch (error) {
    if (env.DEPLOYMENT_MODE === "development") {
      console.warn("[voice-gateway] Falling back to demo snapshot.", error);
      return demoSnapshot;
    }
    throw error;
  }
}
