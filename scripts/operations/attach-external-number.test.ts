import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attachExternalNumber: vi.fn(),
  detachExternalNumber: vi.fn(),
  createDatabaseClient: vi.fn(() => ({ db: {}, pool: { end: vi.fn() } })),
}));

vi.mock("@lobbystack/db", () => ({ createDatabaseClient: mocks.createDatabaseClient }));
vi.mock("@lobbystack/domain", () => ({ attachExternalNumber: mocks.attachExternalNumber, detachExternalNumber: mocks.detachExternalNumber }));

import { main, parseAttachExternalNumberArgs } from "./attach-external-number";

const businessId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";
const base = ["--business-id", businessId, "--number", "+381211234567"];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("attach-external-number", () => {
  it("reads the business, the number and the flags", () => {
    expect(parseAttachExternalNumberArgs(base)).toEqual({ businessId, number: "+381211234567", remove: false, apply: false });
    expect(parseAttachExternalNumberArgs([...base, "--agent-id", agentId, "--apply"])).toMatchObject({ agentId, apply: true });
  });

  it("refuses a number that isn't E.164 and an id that isn't a UUID", () => {
    expect(() => parseAttachExternalNumberArgs(["--business-id", businessId, "--number", "021/1234567"])).toThrow(/E\.164/);
    expect(() => parseAttachExternalNumberArgs(["--business-id", "nope", "--number", "+381211234567"])).toThrow();
    expect(() => parseAttachExternalNumberArgs(["--number", "+381211234567"])).toThrow();
  });

  it("changes nothing without --apply, and doesn't open the database", async () => {
    await main(base);
    expect(mocks.attachExternalNumber).not.toHaveBeenCalled();
    expect(mocks.createDatabaseClient).not.toHaveBeenCalled();
  });

  it("attaches with --apply, as the worker role", async () => {
    mocks.attachExternalNumber.mockResolvedValue({ phoneNumberId: "number-1", e164: "+381211234567", agentId, created: true });
    await main([...base, "--apply"]);
    expect(mocks.createDatabaseClient).toHaveBeenCalledWith("lobbystack_worker");
    expect(mocks.attachExternalNumber).toHaveBeenCalledWith(expect.anything(), { businessId, e164: "+381211234567" });
  });

  it("passes the chosen agent on", async () => {
    mocks.attachExternalNumber.mockResolvedValue({ phoneNumberId: "number-1", e164: "+381211234567", agentId, created: false });
    await main([...base, "--agent-id", agentId, "--apply"]);
    expect(mocks.attachExternalNumber).toHaveBeenCalledWith(expect.anything(), { businessId, e164: "+381211234567", agentId });
  });

  it("removes with --remove --apply, and refuses an agent there", async () => {
    mocks.detachExternalNumber.mockResolvedValue(true);
    await main([...base, "--remove", "--apply"]);
    expect(mocks.detachExternalNumber).toHaveBeenCalledWith(expect.anything(), { businessId, e164: "+381211234567" });
    await expect(main([...base, "--remove", "--agent-id", agentId])).rejects.toThrow(/only applies when attaching/);
  });
});
