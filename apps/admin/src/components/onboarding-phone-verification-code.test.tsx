// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
function setup(approved: boolean, stage = "verify_phone_code") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, onboardingStage: stage }] });
  client.setQueryData(["phone-verification", "business"], { attempt: { id: "attempt", status: "pending", phoneE164: "+14165550188" } });
  const fetchMock = vi.fn(async () => Response.json({ approved, status: approved ? "approved" : "pending" })); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingPhoneVerificationCodeSurface /></QueryClientProvider>);
  return fetchMock;
}
describe("original phone code verification", () => {
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
