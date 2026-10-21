import { NextResponse } from "next/server";

import { removeContactPasscode, setContactPasscode } from "@lobbystack/domain";
import { isContactPasscode, isGuessableContactPasscode } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

// The contact's keypad PIN for appointment changes. Responses say whether one
// is set, never the PIN.
export const PUT = operatorRoute<{ contactId: string }>(async ({ userId, businessId, body, domain }, { contactId }) => {
  const passcode = body.passcode;
  if (typeof passcode !== "string" || !isContactPasscode(passcode)) return jsonError("passcode must be 4 to 8 digits.", 400, "invalid_passcode");
  if (isGuessableContactPasscode(passcode)) return jsonError("passcode is too easy to guess.", 400, "guessable_passcode");
  const status = await setContactPasscode(domain, { userId, businessId, contactId, passcode });
  return status ? NextResponse.json({ contactId, passcode: status }) : jsonError("Contact not found.", 404);
});

export const DELETE = operatorRoute<{ contactId: string }>(async ({ userId, businessId, domain }, { contactId }) => {
  const removed = await removeContactPasscode(domain, { userId, businessId, contactId });
  return removed ? NextResponse.json({ contactId, passcode: null }) : jsonError("Contact not found.", 404);
});
