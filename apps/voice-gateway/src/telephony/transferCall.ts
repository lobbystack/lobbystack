import { loadVoiceGatewayEnv } from "@lobbystack/config";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildLiveCallUpdateTwiml(input: {
  sayMessage?: string;
  destination?: string;
  actionUrl?: string;
  hangup?: boolean;
}): string {
  const parts = ["<Response>"];

  if (input.sayMessage) {
    parts.push(`<Say>${escapeXml(input.sayMessage)}</Say>`);
  }

  if (input.destination) {
    const actionAttribute = input.actionUrl
      ? ` action="${escapeXml(input.actionUrl)}" method="POST"`
      : "";
    parts.push(`<Dial${actionAttribute}>${escapeXml(input.destination)}</Dial>`);
  } else if (input.hangup ?? !input.sayMessage) {
    parts.push("<Hangup />");
  }

  parts.push("</Response>");
  return parts.join("");
}

async function updateLiveCallTwiml(input: {
  callSid: string;
  twiml: string;
}): Promise<void> {
  const env = loadVoiceGatewayEnv(process.env);

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are required to update a live call.");
  }

  const formData = new URLSearchParams();
  formData.set("Twiml", input.twiml);

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

export async function transferLiveCall(input: {
  callSid: string;
  destination: string;
  actionUrl?: string;
  sayMessage?: string;
}): Promise<void> {
  await updateLiveCallTwiml({
    callSid: input.callSid,
    twiml: buildLiveCallUpdateTwiml({
      ...(input.sayMessage ? { sayMessage: input.sayMessage } : {}),
      destination: input.destination,
      ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
    }),
  });
}

export async function endLiveCallWithMessage(input: {
  callSid: string;
  sayMessage: string;
}): Promise<void> {
  await updateLiveCallTwiml({
    callSid: input.callSid,
    twiml: buildLiveCallUpdateTwiml({
      sayMessage: input.sayMessage,
      hangup: true,
    }),
  });
}

export async function endLiveCallSilently(input: {
  callSid: string;
}): Promise<void> {
  await updateLiveCallTwiml({
    callSid: input.callSid,
    twiml: buildLiveCallUpdateTwiml({
      hangup: true,
    }),
  });
}
