import { isTollFreeDirection, zadarmaFlag, type ZadarmaDirection } from "./zadarmaDirections";
import { ZadarmaApiError, type ZadarmaClient } from "./zadarmaClient";

/**
 * Reads the Zadarma account and says whether LobbyStack can sell numbers from it. It orders and changes nothing.
 *
 * It signs real requests, so a "Wrong signature" answer means the keys or the signing are wrong. It lists the
 * account's numbers, its documents groups (the id of the one to use is ZADARMA_DOCUMENTS_GROUP_ID), the
 * destinations Zadarma sells in the country, and whether each group's documents suit each landline destination.
 * See docs/voice/runtime.md, "Use Zadarma". The command is scripts/operations/zadarma-check.ts.
 */

type Reader = Pick<ZadarmaClient, "get">;

type Group = { id: string; organization?: string; country?: string; city?: string };

export type ZadarmaReport = {
  country: string;
  numbers: Array<{ number: string; status?: string; sip?: string }> | { error: string };
  groups: Group[] | { error: string };
  directions: Array<{ id: string; name?: string; areaCode?: string; monthly: string; toll: boolean; texts: boolean }> | { error: string };
  fit: Array<{ group: string; direction: string; name?: string; informationMatches: boolean; documentsUploaded: boolean; documentsVerified: boolean; addressMatches: boolean }>;
  sample: { direction: string; name?: string; available: number } | { error: string } | null;
  fitError?: string;
};

const flag = (value: unknown) => zadarmaFlag(value as never);
const describe = (error: unknown) => error instanceof ZadarmaApiError ? error.message : error instanceof Error ? error.message : String(error);

async function attempt<T>(read: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await read();
  } catch (error) {
    return { error: describe(error) };
  }
}

export async function checkZadarma(client: Reader, options: { country: string; documentsGroupId?: string | undefined }): Promise<ZadarmaReport> {
  const country = options.country.toUpperCase();
  const numbers = await attempt(async () => ((await client.get<{ info?: Array<{ number: string; status?: string; sip?: string }> }>("/v1/direct_numbers/")).info ?? []).map(({ number, status, sip }) => ({ number, ...(status ? { status } : {}), ...(sip ? { sip } : {}) })));
  const groups = await attempt(async () => ((await client.get<{ groups?: Group[] }>("/v1/documents/groups/list/")).groups ?? []).map(({ id, organization, country: groupCountry, city }) => ({ id: String(id), ...(organization ? { organization } : {}), ...(groupCountry ? { country: groupCountry } : {}), ...(city ? { city } : {}) })));
  const listed = await attempt(async () => (await client.get<{ info?: ZadarmaDirection[] }>("/v1/direct_numbers/country/", { country })).info ?? []);
  const directions = Array.isArray(listed)
    ? listed.map((direction) => ({ id: String(direction.id), ...(direction.name ? { name: direction.name } : {}), ...(direction.areaCode !== undefined ? { areaCode: String(direction.areaCode) } : {}), monthly: `${direction.monthly_fee ?? "?"} ${direction.currency ?? ""}`.trim(), toll: isTollFreeDirection(direction), texts: flag(direction.receive_sms) }))
    : listed;

  const report: ZadarmaReport = { country, numbers, groups, directions, fit: [], sample: null };
  if (!Array.isArray(directions)) return report;
  const landlines = directions.filter((direction) => !direction.toll);
  if (landlines[0]) {
    const first = landlines[0];
    const available = await attempt(async () => (await client.get<{ numbers?: unknown[] }>(`/v1/direct_numbers/available/${encodeURIComponent(first.id)}/`)).numbers?.length ?? 0);
    report.sample = typeof available === "number" ? { direction: first.id, ...(first.name ? { name: first.name } : {}), available } : available;
  }
  // The group an order goes under is the one ZADARMA_DOCUMENTS_GROUP_ID names, or every group when none is set yet.
  const checked = Array.isArray(groups) ? groups.filter((group) => !options.documentsGroupId || group.id === options.documentsGroupId) : [];
  for (const group of checked) {
    for (const direction of landlines.slice(0, 4)) {
      const result = await attempt(() => client.get<{ is_information_match?: unknown; is_documents_uploaded?: unknown; is_documents_verified?: unknown; is_address_match?: unknown }>(`/v1/documents/groups/valid/${encodeURIComponent(group.id)}/`, { direction_id: direction.id }));
      if ("error" in result) { report.fitError = result.error; continue; }
      report.fit.push({ group: group.id, direction: direction.id, ...(direction.name ? { name: direction.name } : {}), informationMatches: flag(result.is_information_match), documentsUploaded: flag(result.is_documents_uploaded), documentsVerified: flag(result.is_documents_verified), addressMatches: flag(result.is_address_match) });
    }
  }
  return report;
}

/** What to do next, in plain words, from what the account showed. */
export function adviseZadarma(report: ZadarmaReport, env: { documentsGroupId?: string | undefined; sipHost?: string | undefined }): string[] {
  const advice: string[] = [];
  const failed = [report.numbers, report.groups, report.directions].find((part) => !Array.isArray(part));
  if (failed && !Array.isArray(failed)) {
    advice.push(`Zadarma refused a request: ${failed.error}. Check ZADARMA_API_KEY and ZADARMA_API_SECRET (my.zadarma.com/api).`);
    return advice;
  }
  if (Array.isArray(report.groups) && !report.groups.length) advice.push("The account has no documents group. Add your company's papers and address in the account, then run this again.");
  if (!env.documentsGroupId && Array.isArray(report.groups) && report.groups.length) advice.push(`Set ZADARMA_DOCUMENTS_GROUP_ID on the admin and the worker to one of: ${report.groups.map((group) => group.id).join(", ")}.`);
  if (!env.sipHost) advice.push("Set ZADARMA_SIP_HOST on the worker to the SIP server's host, and port when it isn't 5060.");
  if (Array.isArray(report.directions) && !report.directions.some((direction) => !direction.toll)) advice.push(`Zadarma sells no landline numbers in ${report.country}.`);
  if (report.fit.length && !report.fit.some((entry) => entry.documentsVerified && entry.informationMatches)) advice.push("No documents group is verified for these destinations yet. An order under it waits until Zadarma verifies the documents.");
  if (report.sample && "available" in report.sample && report.sample.available === 0) advice.push(`Zadarma lists no ${report.sample.name ?? "landline"} numbers to choose from. It assigns one when an order is placed, so the dashboard has no numbers to offer until LobbyStack keeps some of its own.`);
  if (!advice.length) advice.push("Zadarma is ready: the keys sign, a documents group is set, and landline numbers are for sale.");
  return advice;
}
