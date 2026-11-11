// @vitest-environment jsdom
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

async function renderCard(props: { called?: boolean; canSetUp?: boolean; lines: HomePhoneLine[] }, locale: "en" | "sr" = "en") {
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "dashboard", resources: { en: { dashboard: en, common: enCommon }, sr: { dashboard: sr, common: srCommon } } });
  const client = new QueryClient();
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  const view = render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><HomePhoneCard called={props.called ?? false} canSetUp={props.canSetUp ?? true} lines={props.lines} /></QueryClientProvider></I18nextProvider>);
  return Object.assign(view, { i18n });
}

describe("phone card on Home", () => {
  it("shows the number, the waiting status, who answers first and Test call for one number", async () => {
    const opened: unknown[] = [];
    const unregister = registerTestWindow((options) => opened.push(options));
    await renderCard({ lines: [front] });
    expect(screen.getByRole("heading", { name: en.home.phone.title })).toBeTruthy();
    expect(screen.getByText("(416) 555-0100")).toBeTruthy();
    expect(screen.getByText(en.home.phone.status.waiting)).toBeTruthy();
    // One number needs no agent name.
    expect(screen.queryByText("Front desk")).toBeNull();
    expect(screen.getByRole("link", { name: en.home.phone.answersFirst.agent }).getAttribute("href")).toBe("/agents/agent-front#staff-first");
    screen.getByRole("button", { name: enCommon.testCall.trigger }).click();
    expect(opened).toEqual([{ agentId: "agent-front" }]);
    unregister();
  });

  it("says the line is answering once a call came in", async () => {
    await renderCard({ called: true, lines: [{ ...front, staffFirstMode: "always" }] });
    expect(screen.getByText(en.home.phone.status.answering)).toBeTruthy();
    expect(screen.queryByText(en.home.phone.status.waiting)).toBeNull();
    expect(screen.getByRole("link", { name: en.home.phone.answersFirst.team })).toBeTruthy();
  });

  it("gives each number its own row with its agent, who answers first and a Test call for that agent", async () => {
    const opened: unknown[] = [];
    const unregister = registerTestWindow((options) => opened.push(options));
    await renderCard({ lines: [front, evenings] });
    expect(screen.getByRole("heading", { name: en.home.phone.titleMany })).toBeTruthy();
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

  it("shows nothing for a business with no number", async () => {
    const { container } = await renderCard({ lines: [] });
    expect(container.innerHTML).toBe("");
  });

  it("leaves who answers first unlinked for someone who can't change it", async () => {
    await renderCard({ canSetUp: false, lines: [front] });
    expect(screen.getByText(en.home.phone.answersFirst.agent)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("writes Serbian in Latin script", async () => {
    await renderCard({ lines: [front] }, "sr");
    expect(screen.getByText(sr.home.phone.status.waiting)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[Ѐ-ӿ]/);
  });
});
