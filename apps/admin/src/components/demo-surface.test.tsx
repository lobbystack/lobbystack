// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoSurface } from "./demo-surface";

const theme = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("./theme-provider", () => ({ useTheme: () => theme }));
vi.mock("./marketing/landing-navbar", () => ({ LandingNavbar: () => null }));
vi.mock("./demo-voice-client", () => ({ DemoVoiceClient: () => <div data-testid="voice-demo" /> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "fr", getFixedT: (locale: string) => (key: string, args?: { businessName?: string }) => `${locale}:${key}${args?.businessName ? `::${args.businessName}` : ""}` } }) }));
beforeEach(() => { const storage = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }); window.history.replaceState({}, "", "/demo#prospect_demo_token=fixture-token"); localStorage.setItem("theme", "dark"); theme.setTheme.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("original prospect demo states", () => {
  it("shows loading while preview resolves and restores the previous theme on unmount", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { unmount } = render(<DemoSurface />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(theme.setTheme).toHaveBeenCalledWith("light");
    unmount();
    expect(theme.setTheme).toHaveBeenLastCalledWith("dark");
  });
  it("renders an invalid link without calling the provider", async () => {
    window.history.replaceState({}, "", "/demo");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<DemoSurface />);
    expect(await screen.findByText("fr:states.invalid.title")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("updates a preparing demo when it becomes active and honors its locale over the viewer locale", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(++calls === 1 ? { state: "preparing", businessName: "Acme Dental", locale: "en" } : { state: "active", businessName: "Acme Dental", businessSlug: "acme", locale: "en", suggestedPrompts: ["What are your hours?", "Do you take walk-ins?"] })));
    render(<DemoSurface />);
    expect(await screen.findByText("en:states.preparing.titleWithBusiness::Acme Dental")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("voice-demo")).toBeTruthy(), { timeout: 2500 });
    expect(screen.getByText("en:active.title::Acme Dental")).toBeTruthy();
    expect(screen.getByText("What are your hours?")).toBeTruthy();
    expect(screen.getByText("Do you take walk-ins?")).toBeTruthy();
    const claimLink = screen.getByRole("link", { name: "en:active.claimCta" });
    expect(claimLink.getAttribute("href")).toBe("/signup?returnTo=%2Fclaim-demo");
    claimLink.addEventListener("click", event => event.preventDefault(), { once: true });
    fireEvent.click(claimLink);
    expect(sessionStorage.getItem("prospect_demo_token")).toBe("fixture-token");
  });
  it("settles a failed preview request into the original invalid state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network failed"); }));
    render(<DemoSurface />);
    expect(await screen.findByText("fr:states.invalid.title")).toBeTruthy();
  });
});
