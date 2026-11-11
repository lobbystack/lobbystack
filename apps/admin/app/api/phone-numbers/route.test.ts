import { beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({ partnerNumberAvailabilityInTransaction: vi.fn(), verifiedPhone: vi.fn(), schedulePhoneNumberRelease: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", async (original) => ({ ...await original<typeof import("@lobbystack/domain")>(), ...domain }));

import { businesses, onboardingNumberClaimEvents, phoneNumbers } from "@lobbystack/db";
import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

const AGENT = "00000000-0000-4000-8000-0000000000aa";
const number = { id: "00000000-0000-4000-8000-000000000001", e164: "+15145550111", agentId: AGENT, voiceEnabled: true, smsEnabled: true, status: "active", reclaimScheduledAt: null, reclaimReason: null };

/** A query that resolves to the rows of the table it reads, whichever clauses it chains. */
function fakeTx(rows: Map<unknown, unknown[]>) {
  return {
    select: () => ({
      from: (table: unknown) => {
        const chain: Record<string, unknown> = {};
        for (const method of ["where", "orderBy", "limit"]) chain[method] = () => chain;
        chain.then = (resolve: (value: unknown[]) => unknown) => resolve(rows.get(table) ?? []);
        return chain;
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  domain.partnerNumberAvailabilityInTransaction.mockResolvedValue(null);
  fakeOperator.tx = fakeTx(new Map<unknown, unknown[]>([[businesses, [{ replacementReservedAt: null, replacementUsedAt: null }]], [onboardingNumberClaimEvents, []], [phoneNumbers, [number]]]));
});

describe("GET /api/phone-numbers", () => {
  it("names the agent each number reaches", async () => {
    const body = await (await GET(new Request("http://localhost:3000/api/phone-numbers"))).json() as { phoneNumbers: Array<{ id: string; agentId: string | null }> };
    expect(body.phoneNumbers).toEqual([expect.objectContaining({ id: number.id, agentId: AGENT })]);
  });
});
