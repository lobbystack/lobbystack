// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingWebsiteSurface } from "./onboarding-website-surface";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
beforeEach(() => push.mockReset());
function setup(options: { websiteUrl?: string; fail?: boolean; refresh?: Promise<Response> } = {}) {
  let reads = 0;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/businesses") {
      if (reads++ > 0 && options.refresh) return options.refresh;
      return Response.json({ businesses: [{ businessId: "business-1", active: true, websiteUrl: options.websiteUrl }] });
    }
    return options.fail ? Response.json({ error: "Private provider diagnostics" }, { status: 500 }) : Response.json({ documentId: "document-1" });
  });
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><OnboardingWebsiteSurface /></QueryClientProvider>);
  return fetcher;
}
describe("onboarding website", () => {
  it("submits the URL with the onboarding context", async () => {
    const fetcher = setup();
    fireEvent.change(screen.getByLabelText("website.label"), { target: { value: "example.com" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "website.continue" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "website.continue" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/knowledge"));
    const submission = fetcher.mock.calls.find(([url]) => url === "/api/knowledge");
    expect(JSON.parse(String(submission?.[1]?.body))).toEqual({ businessId: "business-1", title: "example.com", sourceType: "website", sourceUrl: "example.com", onboarding: true });
  });
  it("waits for refreshed durable progress before navigating", async () => {
    let finish!: (response: Response) => void;
    const refresh = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = setup({ websiteUrl: "https://example.com", refresh });
    await waitFor(() => expect((screen.getByLabelText("website.label") as HTMLInputElement).value).toBe("https://example.com"));
    fireEvent.click(screen.getByRole("button", { name: "website.continue" }));
    await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url === "/api/businesses")).toHaveLength(2));
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "website.submitting" }) as HTMLButtonElement).disabled).toBe(true);
    finish(Response.json({ businesses: [{ businessId: "business-1", active: true, onboardingStage: "knowledge" }] }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/knowledge"));
  });
  it("prefills the saved website when revisiting", async () => {
    setup({ websiteUrl: "https://example.com" });
    await waitFor(() => expect((screen.getByLabelText("website.label") as HTMLInputElement).value).toBe("https://example.com"));
  });
  it("shows the localized submission error", async () => {
    setup({ websiteUrl: "https://example.com", fail: true });
    await waitFor(() => expect((screen.getByRole("button", { name: "website.continue" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "website.continue" }));
    expect(await screen.findByText("website.submitFailed")).toBeTruthy();
    expect(screen.queryByText("Private provider diagnostics")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
  it("shows the localized skip error and stays on the form", async () => {
    setup({ fail: true });
    await waitFor(() => expect((screen.getByRole("button", { name: "website.skip" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "website.skip" }));
    expect(await screen.findByText("website.skipFailed")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
