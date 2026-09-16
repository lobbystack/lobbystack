// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LivePhoneNumberSettingsSurface } from "./live-phone-number-settings-surface";

const actions = vi.hoisted(() => ({ upgrade: vi.fn(), navigate: vi.fn() }));
vi.mock("./upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => actions.upgrade }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: actions.navigate }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(plan: string, role = "business_owner", usedAt: string | null = null, primary = true, reclaimScheduledAt: string | null = null, pending = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
  client.setQueryData(["phone-numbers", "business"], { phoneNumbers: primary ? [{ id: "phone", e164: "+14165550100", status: "active", reclaimScheduledAt }] : [], replacement: { usedAt, activeClaim: pending ? { id: "claim", status: "provisioning" } : null } });
  client.setQueryData(["billing", "business"], { account: { plan } });
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.includes("/claim/claim?")) return Response.json({ claim: { status: "claimed", phoneNumberId: "claimed-phone", requestedE164: "+14165550200" } });
    if (input.includes("/claim?")) return Response.json({ claimId: "claim" });
    if (input.includes("/search?") || input.includes("/suggestion?")) {
      const limit = init?.body ? JSON.parse(String(init.body)).limit ?? 10 : 10;
      return Response.json({ numbers: Array.from({ length: limit }, (_, index) => ({ phoneE164: `+141655502${String(index).padStart(2, "0")}`, countryCode: "CA", claimToken: `offer-${index}`, capabilities: { voice: true, sms: true } })) });
    }
    if (input.includes("/api/phone-numbers?")) return Response.json({ phoneNumbers: [{ id: "claimed-phone", e164: "+14165550200", status: "active" }], replacement: { usedAt: "2026-09-05" } });
    throw new Error(`Unexpected request: ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LivePhoneNumberSettingsSurface /></QueryClientProvider>);
  return { client, fetchMock };
}
describe("phone-number replacement permissions", () => {
  it("resumes a replacement after reload and displays the newly provisioned number", async () => {
    const { fetchMock } = setup("starter", "business_owner", null, true, null, true);
    expect(screen.getByRole("button", { name: "phoneNumber.actions.requestChange" }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(screen.getByText("(416) 555-0200")).toBeTruthy(), { timeout: 2500 });
    expect(fetchMock.mock.calls.every(([url]) => url.includes("/api/phone-numbers?"))).toBe(true);
  });
  it("matches main by disabling replacement without an included dedicated number", () => {
    setup("free_cloud");
    expect(screen.getByRole("button", { name: "phoneNumber.actions.requestChange" }).hasAttribute("disabled")).toBe(true);
  });
  it("allows an administrator with an eligible plan to request replacement", () => {
    setup("starter");
    expect(screen.getByRole("button", { name: "phoneNumber.actions.requestChange" }).hasAttribute("disabled")).toBe(false);
  });
  it("keeps the one-time replacement unavailable after use", () => {
    setup("starter", "business_owner", "2026-09-05T00:00:00Z");
    expect(screen.getByRole("button", { name: "phoneNumber.actions.requestChange" }).hasAttribute("disabled")).toBe(true);
  });
  it("hides replacement controls from viewers", () => {
    setup("starter", "viewer");
    expect(screen.queryByRole("button", { name: "phoneNumber.actions.requestChange" })).toBeNull();
  });
  it("opens the original chooser and loads more replacement inventory", async () => {
    const { fetchMock } = setup("starter");
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.actions.requestChange" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "phoneNumber.picker.select" })).toHaveLength(10));
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.picker.loadMore" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "phoneNumber.picker.select" })).toHaveLength(20));
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/phone-numbers/replacement/search"))).toBe(true);
  });
  it.each([true, false])("claims through the correct API when an existing number is %s", async primary => {
    const { fetchMock } = setup("starter", "business_owner", null, primary);
    await userEvent.click(screen.getByRole("button", { name: primary ? "phoneNumber.actions.requestChange" : "phoneNumber.actions.getNumber" }));
    const select = await screen.findAllByRole("button", { name: "phoneNumber.picker.select" });
    await userEvent.click(select[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock.mock.calls.some(([url]) => url.includes(primary ? "/phone-numbers/replacement/claim?" : "/onboarding/phone-numbers/claim?"))).toBe(true);
  });
  it("opens the shared upgrade dialog for a free plan without a number", async () => {
    setup("free_cloud", "business_owner", null, false);
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.requiresPaidPlan.upgradeCta" }));
    expect(actions.upgrade).toHaveBeenCalledOnce();
  });
  it("restores the scheduled-reclaim banner and upgrade action", async () => {
    setup("starter", "business_owner", null, true, "2026-10-01T00:00:00Z");
    expect(screen.getByText("phoneNumber.reclaim.title")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.reclaim.upgradeCta" }));
    expect(actions.upgrade).toHaveBeenCalledOnce();
  });
  it("keeps the verified country and area code when inventory is empty", async () => {
    const { fetchMock } = setup("starter", "business_owner", null, false);
    fetchMock.mockResolvedValueOnce(Response.json({ market: { countryCode: "CA", areaCode: "416" }, numbers: [] }));
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }));
    await screen.findByText("phoneNumber.picker.empty");
    expect((screen.getByLabelText("phoneNumber.picker.areaCodeLabel") as HTMLInputElement).value).toBe("416");
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.picker.search" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).selection.countryCode).toBe("CA");
  });
  it("refreshes signed alternatives when a selected number becomes unavailable", async () => {
    const { fetchMock } = setup("starter", "business_owner", null, false);
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }));
    const select = await screen.findAllByRole("button", { name: "phoneNumber.picker.select" });
    fetchMock.mockResolvedValueOnce(Response.json({ claimId: "claim" }))
      .mockResolvedValueOnce(Response.json({ claim: { status: "unavailable", phoneNumberId: null } }))
      .mockResolvedValueOnce(Response.json({ market: { countryCode: "CA", areaCode: "416" }, numbers: [{ phoneE164: "+14165550999", countryCode: "CA", claimToken: "fresh-offer", capabilities: { voice: true, sms: true } }] }));
    await userEvent.click(select[0]!);
    await screen.findByText("phoneNumber.picker.unavailable");
    await screen.findByText("(416) 555-0999");
    expect(screen.queryByText("(416) 555-0200")).toBeNull();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("/search?");
  });
  it("routes an unverified operator to phone verification", async () => {
    const { fetchMock } = setup("starter", "business_owner", null, false);
    fetchMock.mockResolvedValue(Response.json({ error: "A verified phone is required before choosing a number." }, { status: 400 }));
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }));
    await waitFor(() => expect(actions.navigate).toHaveBeenCalledWith("/onboarding/verify-phone"));
  });
});
