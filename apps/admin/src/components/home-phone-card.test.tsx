// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import enCommon from "../../public/locales/en/common.json";
import en from "../../public/locales/en/dashboard.json";
import srCommon from "../../public/locales/sr/common.json";
import sr from "../../public/locales/sr/dashboard.json";
import { registerTestWindow } from "@/lib/test-window";
import { HomePhoneCard, type HomePhoneLine } from "./home-phone-card";

afterEach(cleanup);

const front: HomePhoneLine = { e164: "+14165550100", agentId: "agent-front", agentName: "Front desk", staffFirstMode: "never" };
const evenings: HomePhoneLine = { e164: "+14165550111", agentId: "agent-evenings", agentName: "Evenings", staffFirstMode: "business_hours" };
const metrics = <div data-testid="results">Booked value</div>;

async function renderCard(props: { called?: boolean; canSetUp?: boolean; lines: HomePhoneLine[]; results?: ReactNode }, locale: "en" | "sr" = "en") {
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "dashboard", resources: { en: { dashboard: en, common: enCommon }, sr: { dashboard: sr, common: srCommon } } });
  const client = new QueryClient();
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  const view = render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><HomePhoneCard called={props.called ?? false} canSetUp={props.canSetUp ?? true} lines={props.lines} results={props.results === undefined ? metrics : props.results} /></QueryClientProvider></I18nextProvider>);
  return Object.assign(view, { i18n });
}

describe("phone card on Home", () => {
  it("heads the number with the ready status and a green dot, then who answers first, Test call and the results", async () => {
    const opened: unknown[] = [];
    const unregister = registerTestWindow((options) => opened.push(options));
    const { container } = await renderCard({ lines: [front] });
    const heading = screen.getByRole("heading", { name: en.home.phone.status.ready });
    // The dot sits after the heading's text, green and still in both states.
    const dot = heading.nextElementSibling!;
    expect(dot.getAttribute("data-slot")).toBe("phone-status-dot");
    expect(dot.className).toContain("bg-status-success-foreground");
    expect(dot.className).not.toMatch(/animate-/);
    expect(screen.getByText("(416) 555-0100")).toBeTruthy();
    // One number needs no agent name.
    expect(screen.queryByText("Front desk")).toBeNull();
    expect(screen.getByRole("link", { name: en.home.phone.answersFirst.agent }).getAttribute("href")).toBe("/agents/agent-front#staff-first");
    screen.getByRole("button", { name: enCommon.testCall.trigger }).click();
    expect(opened).toEqual([{ agentId: "agent-front" }]);
    // The results sit in the same card, under the divider that closes the phone part.
    const card = container.querySelector("[data-slot='surface']")!;
    expect(within(card as HTMLElement).getByTestId("results")).toBeTruthy();
    expect(screen.getByRole("region", { name: en.home.phone.status.ready }).className).toContain("border-b");
    unregister();
  });

  it("says the agent is taking calls once a call came in, with the same green dot", async () => {
    await renderCard({ called: true, lines: [{ ...front, staffFirstMode: "always" }] });
    const heading = screen.getByRole("heading", { name: en.home.phone.status.live });
    expect(heading.nextElementSibling!.className).toContain("bg-status-success-foreground");
    expect(screen.queryByText(en.home.phone.status.ready)).toBeNull();
    expect(screen.getByRole("link", { name: en.home.phone.answersFirst.team })).toBeTruthy();
  });

  it("gives each number its own row with its agent, who answers first and a Test call for that agent", async () => {
    const opened: unknown[] = [];
    const unregister = registerTestWindow((options) => opened.push(options));
    await renderCard({ called: true, lines: [front, evenings] });
    expect(screen.getByRole("heading", { name: en.home.phone.status.liveMany })).toBeTruthy();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Front desk")).toBeTruthy();
    const second = within(rows[1]!);
    expect(second.getByText("(416) 555-0111")).toBeTruthy();
    expect(second.getByText("Evenings")).toBeTruthy();
    expect(second.getByRole("link", { name: en.home.phone.answersFirst.teamDuringHours }).getAttribute("href")).toBe("/agents/agent-evenings#staff-first");
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

  it("leaves who answers first unlinked for someone who can't change it", async () => {
    await renderCard({ canSetUp: false, lines: [front] });
    expect(screen.getByText(en.home.phone.answersFirst.agent)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("writes Serbian in Latin script", async () => {
    await renderCard({ lines: [front], results: null }, "sr");
    expect(screen.getByText(sr.home.phone.status.ready)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[Ѐ-ӿ]/);
  });
});
