// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enAgent from "../../public/locales/en/agent.json";
import enCommon from "../../public/locales/en/common.json";
import en from "../../public/locales/en/dashboard.json";
import frCommon from "../../public/locales/fr/common.json";
import fr from "../../public/locales/fr/dashboard.json";
import srCommon from "../../public/locales/sr/common.json";
import sr from "../../public/locales/sr/dashboard.json";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { registerTestWindow } from "@/lib/test-window";
import { HomePhoneCard, type HomePhoneLine } from "./home-phone-card";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const front: HomePhoneLine = { e164: "+14165550100", agentId: "agent-front", agentName: "Front desk", staffFirstMode: "never" };
const evenings: HomePhoneLine = { e164: "+14165550111", agentId: "agent-evenings", agentName: "Evenings", staffFirstMode: "business_hours" };
const metrics = <div data-testid="results">Booked value</div>;

async function renderCard(props: { called?: boolean; canSetUp?: boolean; lines: HomePhoneLine[]; results?: ReactNode }, locale: "en" | "fr" | "sr" = "en") {
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "dashboard", resources: { en: { dashboard: en, common: enCommon, agent: enAgent }, fr: { dashboard: fr, common: frCommon }, sr: { dashboard: sr, common: srCommon } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  const view = render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><HomePhoneCard businessId="business" called={props.called ?? false} canSetUp={props.canSetUp ?? true} lines={props.lines} results={props.results === undefined ? metrics : props.results} /></QueryClientProvider></I18nextProvider>);
  return Object.assign(view, { i18n, client });
}

describe("phone card on Home", () => {
  it("heads the card with the ready status and a green dot, then labels the number, who answers first, Test call and the results", async () => {
    const opened: unknown[] = [];
    const unregister = registerTestWindow((options) => opened.push(options));
    const { container } = await renderCard({ lines: [front] });
    const heading = screen.getByRole("heading", { name: en.home.phone.status.ready });
    // The dot sits after the heading's text, green and still in both states.
    const dot = heading.nextElementSibling!;
    expect(dot.getAttribute("data-slot")).toBe("phone-status-dot");
    expect(dot.className).toContain("bg-status-success-foreground");
    expect(dot.className).not.toMatch(/animate-/);
    // The label and the number are their own elements.
    const label = screen.getByText(en.home.phone.numberLabel);
    expect(label.nextElementSibling!.textContent).toBe("(416) 555-0100");
    expect(label.parentElement!.textContent).toBe(`${en.home.phone.numberLabel}(416) 555-0100`);
    // One number needs no agent name.
    expect(screen.queryByText("Front desk")).toBeNull();
    expect(screen.getByRole("button", { name: en.home.phone.answersFirst.agent }).getAttribute("aria-haspopup")).toBe("dialog");
    screen.getByRole("button", { name: enCommon.testCall.trigger }).click();
    expect(opened).toEqual([{ agentId: "agent-front" }]);
    // The heading is in the card, with the number and, under the divider, the results.
    const card = container.querySelector("[data-slot='surface']")!;
    expect(card.contains(heading)).toBe(true);
    expect(within(card as HTMLElement).getByTestId("results")).toBeTruthy();
    expect(screen.getByRole("region", { name: en.home.phone.status.ready }).className).toContain("border-b");
    unregister();
  });

  it("says the agent is taking calls once a call came in, with the same green dot", async () => {
    await renderCard({ called: true, lines: [{ ...front, staffFirstMode: "always" }] });
    const heading = screen.getByRole("heading", { name: en.home.phone.status.live });
    expect(heading.nextElementSibling!.className).toContain("bg-status-success-foreground");
    expect(screen.queryByText(en.home.phone.status.ready)).toBeNull();
    expect(screen.getByRole("button", { name: en.home.phone.answersFirst.team })).toBeTruthy();
  });

  it("opens Staff answers first on Home from the chip, and saving refreshes Home", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PATCH" ? Response.json({ ok: true }) : Response.json({ business: { defaultLocale: "en", timezone: "UTC" }, profile: { staffFirstMode: "never", transferNumber: "+14165550177" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = await renderCard({ lines: [front] });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(screen.getByRole("button", { name: en.home.phone.answersFirst.agent }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("heading", { name: enAgent.staffFirst.mode.label })).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/agent?businessId=business&agentId=agent-front");
    await userEvent.click(await dialog.findByRole("radio", { name: enAgent.staffFirst.mode.options.always }));
    await userEvent.click(dialog.getByRole("button", { name: enAgent.staffFirst.save }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(patch[0]).toBe("/api/agents/agent-front?businessId=business");
    expect(JSON.parse(String(patch[1]!.body))).toMatchObject({ staffFirstMode: "always", staffFirstNumber: "+14165550177" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "staff_first" });
  });

  it("names each number's agent in place of the label, with who answers first and a Test call for that agent", async () => {
    const opened: unknown[] = [];
    const unregister = registerTestWindow((options) => opened.push(options));
    await renderCard({ called: true, lines: [front, evenings] });
    expect(screen.getByRole("heading", { name: en.home.phone.status.liveMany })).toBeTruthy();
    expect(screen.queryByText(en.home.phone.numberLabel)).toBeNull();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Front desk")).toBeTruthy();
    const second = within(rows[1]!);
    expect(second.getByText("(416) 555-0111")).toBeTruthy();
    expect(second.getByText("Evenings")).toBeTruthy();
    expect(second.getByRole("button", { name: en.home.phone.answersFirst.teamDuringHours })).toBeTruthy();
    second.getByRole("button", { name: enCommon.testCall.trigger }).click();
    expect(opened).toEqual([{ agentId: "agent-evenings" }]);
    unregister();
  });

  it("speaks of one agent when every number goes to it", async () => {
    await renderCard({ called: true, lines: [front, { ...evenings, agentId: front.agentId, agentName: front.agentName }] });
    expect(screen.getByRole("heading", { name: en.home.phone.status.live })).toBeTruthy();
  });

  it("shows only the results for a business with no number", async () => {
    await renderCard({ lines: [] });
    expect(screen.getByTestId("results")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows nothing without a number or results", async () => {
    const { container } = await renderCard({ lines: [], results: null });
    expect(container.innerHTML).toBe("");
  });

  it("shows a plain chip to someone who can't change it", async () => {
    await renderCard({ canSetUp: false, lines: [front] });
    expect(screen.getByText(en.home.phone.answersFirst.agent)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.home.phone.answersFirst.agent })).toBeNull();
  });

  it("puts a space before the colon in French", async () => {
    await renderCard({ lines: [front], results: null }, "fr");
    expect(screen.getByText(fr.home.phone.numberLabel).textContent).toBe("Votre numéro :");
  });

  it("writes Serbian in Latin script", async () => {
    await renderCard({ lines: [front], results: null }, "sr");
    expect(screen.getByText(sr.home.phone.status.ready)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[Ѐ-ӿ]/);
  });
});
