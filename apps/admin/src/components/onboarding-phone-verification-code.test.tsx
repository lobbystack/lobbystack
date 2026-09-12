// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingPhoneVerificationCodeSurface } from "./onboarding-phone-verification-surface";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null }); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(approved: boolean, stage = "verify_phone_code", status = "pending") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, onboardingStage: stage }] });
  client.setQueryData(["phone-verification", "business"], { attempt: { id: "attempt", status, phoneE164: "+14165550188" } });
  const fetchMock = vi.fn(async () => Response.json({ approved, status: approved ? "approved" : "pending" })); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingPhoneVerificationCodeSurface /></QueryClientProvider>);
  return fetchMock;
}
describe("original phone code verification", () => {
  it.each(["failed", "expired", "canceled"])("explains %s attempts instead of silently accepting input", status => {
    const fetchMock = setup(false, "verify_phone_code", status);
    expect(screen.getByText("verifyPhoneCode.unavailable")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "verifyPhoneCode.resend" }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("waits for the refreshed attempt instead of redirecting from cached null", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
    client.setQueryData(["phone-verification", "business"], { attempt: null });
    await client.invalidateQueries({ queryKey: ["phone-verification", "business"], refetchType: "none" });
    let resolveAttempt!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { resolveAttempt = resolve; })));
    render(<QueryClientProvider client={client}><OnboardingPhoneVerificationCodeSurface /></QueryClientProvider>);
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => resolveAttempt(Response.json({ attempt: { id: "new-attempt", status: "pending", phoneE164: "+14165550188" } })));
    expect(await screen.findByRole("textbox")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("keeps rejected codes visible without repeatedly submitting them", async () => {
    const fetchMock = setup(false); await userEvent.type(screen.getByRole("textbox"), "123456");
    expect(await screen.findByText("verifyPhoneCode.invalidCode")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("123456");
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(router.replace).not.toHaveBeenCalled();
  });
  it.each([["verify_phone_code", "/onboarding/plan"], ["complete", "/onboarding/number"]])("returns verified %s workspaces to %s", async (stage, destination) => {
    setup(true, stage); await userEvent.type(screen.getByRole("textbox"), "123456");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(destination));
  });
});
