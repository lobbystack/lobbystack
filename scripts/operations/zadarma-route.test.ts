import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createZadarmaCarrier: vi.fn(),
  findOwnedPhoneNumber: vi.fn(),
  routeNumber: vi.fn(),
  missingSetup: vi.fn(),
}));

vi.mock("@lobbystack/providers/zadarma/zadarmaCarrier", () => ({ createZadarmaCarrier: mocks.createZadarmaCarrier }));

import { main } from "./zadarma-route";

const env = { ZADARMA_API_KEY: "k", ZADARMA_API_SECRET: "s", ZADARMA_SIP_HOST: " 203.0.113.9:5060 " };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.missingSetup.mockReturnValue(undefined);
  mocks.findOwnedPhoneNumber.mockResolvedValue({ providerPhoneId: "381213860081", e164: "+381213860081" });
  mocks.routeNumber.mockResolvedValue({ target: "sip:381213860081@203.0.113.9:5060" });
  mocks.createZadarmaCarrier.mockReturnValue({ inventory: { findOwnedPhoneNumber: mocks.findOwnedPhoneNumber }, routing: { missingSetup: mocks.missingSetup, routeNumber: mocks.routeNumber } });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("zadarma-route", () => {
  it("needs an E.164 number, and the keys", async () => {
    await expect(main([], env)).rejects.toThrow("E.164");
    await expect(main(["--number", "021/3860081"], env)).rejects.toThrow("E.164");
    mocks.createZadarmaCarrier.mockReturnValue(undefined);
    await expect(main(["--number", "+381213860081"], {})).rejects.toThrow("Set ZADARMA_API_KEY and ZADARMA_API_SECRET.");
  });

  it("refuses without the SIP host, and for a number that isn't on the account", async () => {
    mocks.missingSetup.mockReturnValue("ZADARMA_SIP_HOST is required to route Zadarma numbers to the SIP server.");
    await expect(main(["--number", "+381213860081"], env)).rejects.toThrow("ZADARMA_SIP_HOST is required");
    mocks.missingSetup.mockReturnValue(undefined);
    mocks.findOwnedPhoneNumber.mockResolvedValue(null);
    await expect(main(["--number", "+381213860081"], env)).rejects.toThrow("isn't on the Zadarma account");
    expect(mocks.routeNumber).not.toHaveBeenCalled();
  });

  it("changes nothing without --apply, and says where it would send the number", async () => {
    await main(["--number", "+381213860081"], env);
    expect(mocks.routeNumber).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(JSON.stringify({ number: "+381213860081", destination: "381213860081@203.0.113.9:5060", apply: false }));
  });

  it("routes the number to the agent with --apply", async () => {
    await main(["--number", "+381213860081", "--apply"], env);
    expect(mocks.routeNumber).toHaveBeenCalledWith({ providerPhoneId: "381213860081", mode: "receptionist" });
  });
});
