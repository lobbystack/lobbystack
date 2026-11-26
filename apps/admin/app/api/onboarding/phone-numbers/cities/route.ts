import { NextResponse } from "next/server";

import { isNumberCountry } from "@lobbystack/domain";
import { soldNumberKind } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { getTelephony, numbersConfigured } from "@/lib/telephony";

export const dynamic = "force-dynamic";

// The cities a number can be ordered in, for a country whose carrier names the number when it takes the order.
// Other countries answer with none, and the picker lists numbers instead.
export const GET = operatorRoute(async ({ request }) => {
  const country = new URL(request.url).searchParams.get("country")?.trim().toUpperCase() ?? "";
  if (!isNumberCountry(country)) return jsonError("country must be a country with phone numbers.", 400);
  if (!numbersConfigured()) return NextResponse.json({ cities: [] });
  return NextResponse.json({ cities: await getTelephony().assignedNumbers.listCities({ countryCode: country, kind: soldNumberKind(country) }) });
});
