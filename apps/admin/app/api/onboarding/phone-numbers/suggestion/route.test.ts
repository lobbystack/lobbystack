import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ limit: vi.fn(), search: vi.fn(), secret: vi.fn(() => "x".repeat(32)) }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/phone-number-search-limit", () => ({ assertPhoneNumberSearchAllowed: fixture.limit }));
vi.mock("@lobbystack/domain", () => ({ searchBusinessNumberInventory: fixture.search }));
vi.mock("@/lib/twilio-provider", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/twilio-provider")>(), getNumberClaimTokenSecret: fixture.secret }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetFakeOperator();
});

it("says phone numbers aren't set up, before a search counts against the limit or needs the claim secret", async () => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "");
  const response = await GET(new Request("http://localhost:3000/api/onboarding/phone-numbers/suggestion?businessId=business"));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "phone_numbers_unavailable" });
  expect(fixture.limit).not.toHaveBeenCalled();
  expect(fixture.secret).not.toHaveBeenCalled();
  expect(fixture.search).not.toHaveBeenCalled();
});
