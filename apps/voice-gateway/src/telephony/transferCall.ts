import { loadVoiceGatewayEnv } from "@ai-receptionist/config";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export async function transferLiveCall(input: {
  callSid: string;
  destination: string;
  actionUrl?: string;
}): Promise<void> {
  const env = loadVoiceGatewayEnv(process.env);

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are required to transfer a live call.");
  }

  const actionAttribute = input.actionUrl
    ? ` action="${escapeXml(input.actionUrl)}" method="POST"`
    : "";
  const twiml = `<Response><Dial${actionAttribute}>${escapeXml(input.destination)}</Dial></Response>`;
  const formData = new URLSearchParams();
  formData.set("Twiml", twiml);

  const authorization = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls/${input.callSid}.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
