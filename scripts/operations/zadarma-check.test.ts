import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkZadarma: vi.fn(),
  adviseZadarma: vi.fn(() => ["Zadarma is ready."]),
  client: vi.fn(),
}));

vi.mock("@lobbystack/providers/zadarma/zadarmaCheck", () => ({ checkZadarma: mocks.checkZadarma, adviseZadarma: mocks.adviseZadarma }));
vi.mock("@lobbystack/providers/zadarma/zadarmaClient", () => ({ ZadarmaClient: class { constructor(config: unknown) { mocks.client(config); } } }));

import { main } from "./zadarma-check";

const env = { ZADARMA_API_KEY: " key ", ZADARMA_API_SECRET: "secret", ZADARMA_DOCUMENTS_GROUP_ID: " 7 ", ZADARMA_SIP_HOST: "sip.example.com:5060" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkZadarma.mockResolvedValue({ country: "RS" });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("zadarma-check", () => {
  it("needs the keys, and a country code that is two letters, before it calls Zadarma", async () => {
    await expect(main([], {})).rejects.toThrow("Set ZADARMA_API_KEY and ZADARMA_API_SECRET.");
    await expect(main(["--country", "SRB"], env)).rejects.toThrow("two-letter code");
    expect(mocks.checkZadarma).not.toHaveBeenCalled();
  });

  it("checks Serbia by default, with the keys and the documents group trimmed", async () => {
    await main([], env);
    expect(mocks.client).toHaveBeenCalledWith({ key: "key", secret: "secret" });
    expect(mocks.checkZadarma).toHaveBeenCalledWith(expect.anything(), { country: "RS", documentsGroupId: "7" });
    expect(mocks.adviseZadarma).toHaveBeenCalledWith({ country: "RS" }, { documentsGroupId: "7", sipHost: "sip.example.com:5060" });
  });

  it("takes another country, and works without a documents group yet", async () => {
    await main(["--country", "hr"], { ZADARMA_API_KEY: "k", ZADARMA_API_SECRET: "s" });
    expect(mocks.checkZadarma).toHaveBeenCalledWith(expect.anything(), { country: "HR", documentsGroupId: undefined });
  });
});
