// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveAccountSurface } from "./live-account-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("./account-security-forms", () => ({ AccountSecurityForms: ({ currentEmail }: { currentEmail?: string | null }) => <div>forms for {currentEmail}</div> }));
vi.mock("./account-passkeys", () => ({ AccountPasskeys: ({ businessName }: { businessName?: string }) => <div>passkeys card for {businessName}</div> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderSurface(account: Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(() => account));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><LiveAccountSurface /></QueryClientProvider>);
}

describe("account page loading", () => {
  it("shows a skeleton shaped like the page, announced to screen readers, until the account arrives", async () => {
    let resolve!: (response: Response) => void;
    const { container } = renderSurface(new Promise<Response>((done) => { resolve = done; }));
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toBe("account.loading");
    // Email and Password side by side, then the Passkeys card, each with its rows or values.
    expect(container.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(8);
    expect(screen.queryByText(/passkeys card/)).toBeNull();
    resolve(Response.json({ user: { id: "user", email: "owner@example.com" }, session: { id: "session", expiresAt: "2030-01-01T00:00:00Z" }, businesses: [{ businessId: "one", name: "First Co", role: "owner", active: false }, { businessId: "two", name: "Active Co", role: "owner", active: true }] }));
    expect(await screen.findByText("forms for owner@example.com")).toBeTruthy();
    // A new passkey is named after the business the person is working in.
    expect(screen.getByText("passkeys card for Active Co")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector("[data-slot=skeleton]")).toBeNull();
  });

  it("replaces the skeleton with an error when the account can't load", async () => {
    renderSurface(Promise.resolve(new Response("{}", { status: 500 })));
    expect(await screen.findByText("Account data is unavailable.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
