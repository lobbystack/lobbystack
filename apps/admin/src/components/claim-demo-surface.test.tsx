// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimDemoSurface } from "./claim-demo-surface";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { router.replace.mockReset(); sessionStorage.clear(); window.history.replaceState({}, "", "/claim-demo?token=fixture-token"); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function setup(state: string | null, claimResponse: () => Promise<Response> = async () => Response.json({ businessId: "business" })) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  const claim = vi.fn(claimResponse);
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/demo/claim") return claim();
    if (url === "/api/demo/preview") return state === null ? new Promise<Response>(() => {}) : Response.json({ state });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<StrictMode><QueryClientProvider client={client}><ClaimDemoSurface /></QueryClientProvider></StrictMode>);
  return { client, claim, fetchMock };
}
describe("main demo-claim behavior through the Next API", () => {
  it("shows the original loading state while preview is unresolved", () => {
    setup(null);
    expect(screen.getByText("claim.loadingDescription")).toBeTruthy();
  });
  it.each(["expired", "invalid", "revoked"])("does not claim a %s preview", async state => {
    const { claim } = setup(state);
    expect(await screen.findByText("claim.unavailableTitle")).toBeTruthy();
    expect(claim).not.toHaveBeenCalled();
  });
  it.each(["active", "claimed"])("claims a %s demo once under StrictMode and clears its token", async state => {
    const { claim } = setup(state);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding/business"));
    expect(claim).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("prospect_demo_token")).toBeNull();
    expect(window.location.search).toBe("");
  });
  it("recovers the token after authentication scrubbed the URL", async () => {
    window.history.replaceState({}, "", "/claim-demo");
    sessionStorage.setItem("prospect_demo_token", "stored-token");
    const { fetchMock } = setup("active");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding/business"));
    expect(fetchMock).toHaveBeenCalledWith("/api/demo/claim", expect.objectContaining({ body: JSON.stringify({ token: "stored-token" }) }));
  });
  it("waits for preparation before making a claim", async () => {
    const { claim, client } = setup("preparing");
    await waitFor(() => expect(client.getQueryData(["prospect-demo-preview", "fixture-token"])).toEqual({ state: "preparing" }));
    expect(claim).not.toHaveBeenCalled();
    expect(screen.getByText("claim.loadingDescription")).toBeTruthy();
    client.setQueryData(["prospect-demo-preview", "fixture-token"], { state: "active" });
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
  });
  it("shows unavailable when another user already claimed the demo", async () => {
    setup("claimed", async () => Response.json({ error: "This prospect demo has already been claimed." }, { status: 400 }));
    expect(await screen.findByText("claim.unavailableTitle")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("retries a failed claim using the original retry control", async () => {
    let attempts = 0;
    const { claim } = setup("active", async () => ++attempts === 1 ? Response.json({ error: "Temporary failure" }, { status: 503 }) : Response.json({ businessId: "business" }));
    await userEvent.click(await screen.findByRole("button", { name: "claim.retry" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding/business"));
    expect(claim).toHaveBeenCalledTimes(2);
  });
  it("retains the token while redirecting an unauthenticated claimant to login", async () => {
    setup("active", async () => Response.json({ error: "Unauthorized" }, { status: 401 }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?returnTo=%2Fclaim-demo"));
    expect(sessionStorage.getItem("prospect_demo_token")).toBe("fixture-token");
  });
});
