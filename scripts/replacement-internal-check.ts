import { createHash, createHmac, randomUUID } from "node:crypto";

const body = JSON.stringify({
  businessSlug: process.env.REPLACEMENT_TEST_BUSINESS_SLUG ?? "demo-business",
  origin: process.env.ADMIN_BASE_URL ?? "http://127.0.0.1:13000",
  publicWebCall: true,
});
const serviceId = process.env.INTERNAL_SERVICE_ID ?? "lobbystack-voice-gateway";
const secret = process.env.INTERNAL_SERVICE_SECRET ?? "replace-with-a-long-service-secret";
const timestamp = String(Date.now());
const nonce = randomUUID();
const bodyHash = createHash("sha256").update(body).digest("hex");
const signature = createHmac("sha256", secret).update(`${serviceId}.${timestamp}.${nonce}.${bodyHash}`).digest("hex");
const headers = {
  "content-type": "application/json",
  "x-service-id": serviceId,
  "x-service-timestamp": timestamp,
  "x-service-nonce": nonce,
  "x-body-sha256": bodyHash,
  "x-service-signature": signature,
};

async function main(): Promise<void> {
  const url = new URL("/voice/context/by-slug", process.env.ADMIN_BASE_URL ?? "http://127.0.0.1:13000");
  const first = await fetch(url, { method: "POST", headers, body });
  if (!first.ok) {
    throw new Error(`Signed voice context failed with status ${first.status}: ${await first.text()}`);
  }
  const replay = await fetch(url, { method: "POST", headers, body });
  if (replay.status !== 401) {
    throw new Error(`Internal request replay returned status ${replay.status} instead of 401.`);
  }
  console.log("voice-worker-role: ok");
  console.log("internal-replay: ok");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
