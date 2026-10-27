// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("@/components/branding-provider", () => ({ useBranding: () => ({ appName: "Acme Reception" }) }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "business" } }) }));

import { PartnerAccessSurface } from "./partner-access-surface";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderWith(response: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PartnerAccessSurface /></QueryClientProvider>);
}

it("lists who on the partner's team opened the business and when they left", async () => {
  renderWith(Response.json({ events: [
    { id: "left", kind: "left", at: "2026-10-26T21:00:00.000Z", name: "Mia", partnerName: "Acme Reception" },
    { id: "opened", kind: "opened", at: "2026-10-26T20:00:00.000Z", name: null, partnerName: "Acme Reception" },
  ] }));
  expect(await screen.findByText("Mia")).toBeTruthy();
  expect(screen.getByText("partnerAccess.left")).toBeTruthy();
  // Someone with no name shows as the partner's team.
  expect(screen.getByText("partnerAccess.someone")).toBeTruthy();
});

it("tells someone who isn't an owner or admin why they can't see it", async () => {
  renderWith(Response.json({ error: "You can't do that in this business.", code: "forbidden" }, { status: 403 }));
  expect((await screen.findByRole("alert")).textContent).toBe("partnerAccess.adminsOnly");
});
