import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ listCities: vi.fn(), configured: vi.fn(() => true) }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ isNumberCountry: (value: string) => ["US", "RS"].includes(value) }));
vi.mock("@/lib/telephony", () => ({ numbersConfigured: fixture.configured, getTelephony: () => ({ assignedNumbers: { listCities: fixture.listCities } }) }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.configured.mockReturnValue(true);
  resetFakeOperator();
});

const request = (query: string) => new Request(`http://localhost:3000/api/onboarding/phone-numbers/cities?businessId=business${query}`);

it("lists the cities of a country that takes orders by city, for the kind sold there", async () => {
  fixture.listCities.mockResolvedValue(["Belgrade", "Novi Sad"]);
  const response = await GET(request("&country=rs"));
  expect(await response.json()).toEqual({ cities: ["Belgrade", "Novi Sad"] });
  expect(fixture.listCities).toHaveBeenCalledWith({ countryCode: "RS", kind: "local" });
});

it("refuses a country without phone numbers, and answers no cities when no carrier is set up", async () => {
  expect((await GET(request("&country=XX"))).status).toBe(400);
  expect((await GET(request(""))).status).toBe(400);
  fixture.configured.mockReturnValue(false);
  expect(await (await GET(request("&country=US"))).json()).toEqual({ cities: [] });
  expect(fixture.listCities).not.toHaveBeenCalled();
});
