import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), withBusinessTransaction: mocks.transaction }));
import { resolveCalendarAccessToken } from "./calendar";

const now = new Date("2026-09-13T12:00:00Z");
const row = { id: "connection", businessId: "business", status: "connected", encryptedAccessToken: "enc:old", encryptedRefreshToken: "enc:refresh", tokenExpiresAt: new Date(now.getTime() - 1000) };
const update = vi.fn();
const refresh = vi.fn();
const context = { db: {} as never };
const input = { businessId: "business", connectionId: "connection", now, decryptToken: (value: string) => value.slice(4), encryptToken: (value: string) => `enc:${value}`, refreshAccessToken: refresh };

function useConnection(value: unknown) {
  const tx = { select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => value ? [value] : [] }) }) }) }), update: () => ({ set: update }) };
  mocks.transaction.mockImplementation(async (_db, _scope, callback) => callback(tx));
}

beforeEach(() => { vi.clearAllMocks(); update.mockReturnValue({ where: async () => undefined }); refresh.mockResolvedValue({ accessToken: "fresh", expiresIn: 3600 }); useConnection(row); });

it("refreshes under the tenant transaction and persists only encrypted tokens", async () => {
  await expect(resolveCalendarAccessToken(context, input)).resolves.toBe("fresh");
  expect(mocks.transaction).toHaveBeenCalledWith(context.db, { businessId: "business", actorType: "worker" }, expect.any(Function));
  expect(refresh).toHaveBeenCalledWith({ refreshToken: "refresh" });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ encryptedAccessToken: "enc:fresh", tokenExpiresAt: new Date(now.getTime() + 3600_000) }));
  expect(update.mock.calls[0]?.[0]).not.toHaveProperty("encryptedRefreshToken");
});

it("uses a still-valid access token without refreshing", async () => {
  useConnection({ ...row, tokenExpiresAt: new Date(now.getTime() + 120_000) });
  await expect(resolveCalendarAccessToken(context, input)).resolves.toBe("old");
  expect(refresh).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});

it("does not persist failed refreshes or use another tenant's connection", async () => {
  refresh.mockRejectedValue(new Error("refresh unavailable"));
  await expect(resolveCalendarAccessToken(context, input)).rejects.toThrow("refresh unavailable");
  expect(update).not.toHaveBeenCalled();
  refresh.mockClear(); useConnection({ ...row, businessId: "foreign" });
  await expect(resolveCalendarAccessToken(context, input)).rejects.toThrow("unavailable");
  expect(refresh).not.toHaveBeenCalled();
});

it("requires reconnection when credentials are missing or disconnected", async () => {
  useConnection({ ...row, encryptedRefreshToken: null });
  await expect(resolveCalendarAccessToken(context, input)).rejects.toThrow("reconnection");
  useConnection({ ...row, status: "disconnected" });
  await expect(resolveCalendarAccessToken(context, input)).rejects.toThrow("unavailable");
  expect(refresh).not.toHaveBeenCalled();
});
