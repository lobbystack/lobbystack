// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingBrandSurface } from "./onboarding-brand-surface";

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
const branding = vi.hoisted(() => ({ appName: "LobbyStack", logoUrl: null as string | null, ready: true, setBranding: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/branding-provider", () => ({ useBranding: () => branding }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function renderSurface(props: { askAppName: boolean; askLogo: boolean }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><OnboardingBrandSurface {...props} /></QueryClientProvider>);
}

function posts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url, init]) => [url, JSON.parse(String(init.body))]);
}

const clients: QueryClient[] = [];
beforeEach(() => {
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:logo");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("brand onboarding", () => {
  it("saves the name and logo, shows them, and moves on to the business", async () => {
    const fetchMock = vi.fn(async () => Response.json({ appName: "Acme Desk", logoUrl: "/api/branding/logo?v=abc" }));
    vi.stubGlobal("fetch", fetchMock);
    renderSurface({ askAppName: true, askLogo: true });
    await userEvent.type(screen.getByLabelText("brand.nameLabel"), "  Acme   Desk ");
    await userEvent.upload(screen.getByLabelText("brand.logoLabel"), new File([PNG], "logo.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByLabelText("Acme Desk").querySelector("img")?.getAttribute("src")).toBe("blob:logo"));
    await userEvent.click(screen.getByRole("button", { name: "brand.continue" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding/business"));
    expect(posts(fetchMock)).toEqual([["/api/branding/initial", { appName: "Acme Desk", logo: Buffer.from(PNG).toString("base64") }]]);
    expect(branding.setBranding).toHaveBeenCalledWith({ appName: "Acme Desk", logoUrl: "/api/branding/logo?v=abc" });
  });

  it("turns down an SVG with script before anything is saved", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderSurface({ askAppName: false, askLogo: true });
    expect(screen.queryByLabelText("brand.nameLabel")).toBeNull();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    await userEvent.upload(screen.getByLabelText("brand.logoLabel"), new File([svg], "logo.svg", { type: "image/svg+xml" }));
    expect(await screen.findByText("brand.errors.logoType")).toBeTruthy();
    expect(screen.getByRole("button", { name: "brand.continue" })).toHaveProperty("disabled", true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the default name when skipped", async () => {
    const fetchMock = vi.fn(async () => Response.json({ appName: "LobbyStack", logoUrl: null }));
    vi.stubGlobal("fetch", fetchMock);
    renderSurface({ askAppName: true, askLogo: true });
    await userEvent.click(screen.getByRole("button", { name: "brand.skip" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding/business"));
    expect(posts(fetchMock)).toEqual([["/api/branding/initial", {}]]);
  });

  it("shows the name someone else saved first and lets the owner carry on", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ error: "Already saved.", code: "branding_already_saved" }, { status: 409 })
      : Response.json({ appName: "Other Desk", logoUrl: null }));
    vi.stubGlobal("fetch", fetchMock);
    renderSurface({ askAppName: true, askLogo: false });
    await userEvent.type(screen.getByLabelText("brand.nameLabel"), "Acme Desk");
    await userEvent.click(screen.getByRole("button", { name: "brand.continue" }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "brand.errors.closed");
    await waitFor(() => expect(branding.setBranding).toHaveBeenCalledWith({ appName: "Other Desk", logoUrl: null }));
    expect(router.push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "brand.continue" }));
    expect(router.push).toHaveBeenCalledWith("/onboarding/business");
  });

  it("explains a name the server refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Bad name.", code: "invalid_app_name" }, { status: 400 })));
    renderSurface({ askAppName: true, askLogo: false });
    await userEvent.type(screen.getByLabelText("brand.nameLabel"), "Acme Desk");
    await userEvent.click(screen.getByRole("button", { name: "brand.continue" }));
    expect(await screen.findByText("brand.errors.appName")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });
});
