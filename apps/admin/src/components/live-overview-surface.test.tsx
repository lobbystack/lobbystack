// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import enCommon from "../../public/locales/en/common.json";
import en from "../../public/locales/en/dashboard.json";
import frCommon from "../../public/locales/fr/common.json";
import enKnowledge from "../../public/locales/en/knowledge.json";
import frKnowledge from "../../public/locales/fr/knowledge.json";
import fr from "../../public/locales/fr/dashboard.json";
import type { Capability } from "@lobbystack/domain";
import { ALL_CAPABILITIES, BusinessCapabilitiesProvider } from "./business-capabilities-provider";
import { LiveOverviewSurface } from "./live-overview-surface";
import { SETUP_STEP_ORDER } from "@/lib/setup-guide";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
// The activation card has its own suite; this one covers follow-up parity.
vi.mock("./dashboard-activation-card", () => ({ DashboardActivationCard: () => null }));
vi.mock("./call-forwarding-dialog", () => ({ CallForwardingFromLink: () => null }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
type Overrides = { upcoming?: Array<Record<string, unknown>>; recentCalls?: Array<Record<string, unknown>>; actionRequired?: Array<Record<string, unknown>>; role?: string; capabilities?: Capability[]; unansweredCount?: number; actionRequiredCount?: number; loading?: boolean };
async function setup(locale: "en" | "fr", callId: string | null, overrides: Overrides = {}) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  // The appointment details sheet picks its side from the screen width.
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const fetchMock = vi.fn(async (_url: string) => Response.json({ error: "Not found." }, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "dashboard", resources: { en: { dashboard: en, common: enCommon, knowledge: enKnowledge }, fr: { dashboard: fr, common: frCommon, knowledge: frKnowledge } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  if (!overrides.loading) client.setQueryData(["dashboard"], {
    businessId: "business", kpis: { calls: { total: 1, deltaPercent: 0 }, appointments: { total: 1, deltaPercent: 0 }, averageDuration: { totalSeconds: 20, deltaSeconds: 0 } }, monthlyCalls: [], recentCalls: overrides.recentCalls ?? [],
    ...(overrides.actionRequiredCount === undefined ? {} : { actionRequiredCount: overrides.actionRequiredCount }),
    actionRequired: overrides.actionRequired ?? [{ id: "follow-up", kind: "voice_message", title: "Voice message from Alex", body: "Please call back.\nCallback: +14165550199\nUrgency: high", callId, createdAt: "2026-09-04T14:30:00Z" }],
    upcoming: overrides.upcoming ?? [{ id: "appointment", startsAt: "2099-09-07T14:30:00Z", endsAt: "2099-09-07T15:00:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced", contactName: "Alex", serviceName: "Consultation", staffName: "Front desk" }],
  });
  if (overrides.unansweredCount !== undefined) client.setQueryData(["unanswered-questions", "business"], { questions: [], openCount: overrides.unansweredCount });
  if (overrides.role) client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", role: overrides.role, active: true, ...(overrides.capabilities ? { capabilities: overrides.capabilities } : {}) }] });
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={ALL_CAPABILITIES}><LiveOverviewSurface /></BusinessCapabilitiesProvider></QueryClientProvider></I18nextProvider>);
  return Object.assign(i18n, { fetchMock });
}
describe("dashboard voice follow-up parity", () => {
  it.each(["en", "fr"] as const)("links the follow-up to its call and shows localized metadata in %s", async locale => {
    const i18n = await setup(locale, "call-123");
    const title = i18n.t("home.actionRequired.titleWithContact", { message: "Please call back", name: "Alex" });
    expect(screen.getByRole("link", { name: title }).getAttribute("href")).toBe("/inbox?call=call-123");
    expect(screen.getByText("+14165550199")).toBeTruthy();
    expect(screen.getAllByText(i18n.t("home.actionRequired.urgent"))).toHaveLength(2);
    expect(screen.getByText(i18n.t("home.upcoming.status.confirmed"))).toBeTruthy();
    expect(screen.getByText(i18n.t("common:channels.phoneCall"))).toBeTruthy();
    expect(screen.queryByText(/Urgency: high/)).toBeNull();
  });
  it("keeps a retained follow-up readable when its related call is absent", async () => {
    await setup("en", null);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/appointments?view=list"]);
    expect(screen.getByText(/Please call back.*Alex/)).toBeTruthy();
  });
});
describe("how many requests are open", () => {
  it("counts every open request and links to the rest in the Inbox when Home lists only some", async () => {
    const i18n = await setup("en", "call-123", { actionRequiredCount: 9 });
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: i18n.t("home.actionRequired.viewAll") }).map((link) => link.getAttribute("href"))).toEqual(["/inbox?status=open", "/appointments?view=list"]);
  });

  it("offers no link when Home lists them all", async () => {
    const i18n = await setup("en", "call-123", { actionRequiredCount: 1 });
    expect(screen.getAllByRole("link", { name: i18n.t("home.actionRequired.viewAll") }).map((link) => link.getAttribute("href"))).toEqual(["/appointments?view=list"]);
  });

  it("opens a handoff on its conversation in the Inbox", async () => {
    await setup("en", null, { actionRequired: [{ id: "conversation-1", kind: "human_handoff", title: "Marie", body: "Wants a person", conversationId: "conversation-1", createdAt: "2026-09-04T14:30:00Z" }] });
    expect(screen.getByRole("link", { name: /Marie/ }).getAttribute("href")).toBe("/inbox?conversation=conversation-1");
  });

  it("holds the link's place while Home loads", async () => {
    const i18n = await setup("en", null, { loading: true });
    const heading = screen.getByRole("heading", { name: i18n.t("home.actionRequired.title") });
    const placeholder = heading.parentElement!.querySelector("span.invisible");
    expect(placeholder?.textContent).toBe(i18n.t("home.actionRequired.viewAll"));
    expect(placeholder?.closest("[aria-hidden='true']")).toBeTruthy();
  });
});

describe("dashboard unanswered questions", () => {
  it.each(["en", "fr"] as const)("links open questions to the knowledge page in %s", async locale => {
    const i18n = await setup(locale, null, { role: "business_admin", unansweredCount: 3 });
    const link = screen.getByRole("link", { name: new RegExp(i18n.t("knowledge:unansweredQuestions.home.count", { count: 3 })) });
    expect(link.getAttribute("href")).toBe("/business/knowledge#unanswered-questions");
  });
  it("counts the open questions as an action and drops the empty state", async () => {
    const i18n = await setup("en", null, { role: "business_owner", unansweredCount: 2, actionRequired: [] });
    expect(screen.queryByText(i18n.t("dashboard:home.actionRequired.emptyTitle"))).toBeNull();
    const heading = screen.getByRole("heading", { name: i18n.t("dashboard:home.actionRequired.title") });
    expect(heading.parentElement?.parentElement?.textContent).toBe(`${i18n.t("dashboard:home.actionRequired.title")}1`);
  });
  it("shows nothing when every question is handled", async () => {
    await setup("en", null, { role: "business_owner", unansweredCount: 0 });
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/appointments?view=list"]);
  });
});
describe("dashboard unanswered questions by access", () => {
  const questionRequests = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/knowledge/questions"));

  it("loads and counts the questions for an admin", async () => {
    const i18n = await setup("en", null, { role: "business_admin", actionRequired: [] });
    await waitFor(() => expect(questionRequests(i18n.fetchMock)).toHaveLength(1));
    expect(questionRequests(i18n.fetchMock)[0]![0]).toBe("/api/knowledge/questions?businessId=business");
  });

  it.each([
    ["a viewer", { role: "viewer" }],
    ["a scheduler", { role: "scheduler" }],
    ["an owner of a business that gives activity only", { role: "business_owner", capabilities: ["activity"] as Capability[] }],
  ])("neither loads nor shows the questions for %s", async (_who, access) => {
    const i18n = await setup("en", null, { ...access, unansweredCount: 2, actionRequired: [] });
    expect(screen.queryByText(i18n.t("knowledge:unansweredQuestions.home.count", { count: 2 }))).toBeNull();
    const heading = screen.getByRole("heading", { name: i18n.t("dashboard:home.actionRequired.title") });
    expect(heading.parentElement?.parentElement?.textContent).toBe(`${i18n.t("dashboard:home.actionRequired.title")}0`);
    expect(screen.getByText(i18n.t("dashboard:home.actionRequired.emptyTitle"))).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(questionRequests(i18n.fetchMock)).toHaveLength(0);
  });
});
describe("dashboard upcoming appointments", () => {
  it("shows the employee an appointment is booked with, and nothing for the business's default staff member", async () => {
    const i18n = await setup("en", null, { upcoming: [
      { id: "with-employee", startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", contactName: "Alex", serviceName: "Consultation", staffName: "Ana", employeeName: "Ana" },
      { id: "default-staff", startsAt: "2026-09-08T14:30:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", contactName: "Sam", serviceName: "Consultation", staffName: "MStudio", employeeName: null },
    ] });
    expect(screen.getByText(i18n.t("home.upcoming.employee", { name: "Ana" }))).toBeTruthy();
    expect(screen.queryByText(i18n.t("home.upcoming.employee", { name: "MStudio" }))).toBeNull();
  });
});
describe("dashboard contact and channel labels", () => {
  const appointment = { startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", status: "confirmed", serviceName: "Consultation" };
  it("labels every booking channel in the upcoming card instead of showing raw slugs", async () => {
    await setup("en", null, { upcoming: [
      { ...appointment, id: "web-voice", sourceChannel: "web_voice", contactName: null, contactPhone: null, contactEmail: null },
      { ...appointment, id: "web-chat", sourceChannel: "web_chat", contactName: "Rosa", contactPhone: null, contactEmail: null },
      { ...appointment, id: "api", sourceChannel: "api", contactName: null, contactPhone: "+14155550100", contactEmail: null },
    ] });
    expect(screen.getByText("Web call")).toBeTruthy();
    expect(screen.getByText("Website chat")).toBeTruthy();
    expect(screen.getByText("API")).toBeTruthy();
    expect(screen.queryByText("web_voice")).toBeNull();
    expect(screen.queryByText("web_chat")).toBeNull();
    expect(screen.getByText("Web caller")).toBeTruthy();
    expect(screen.getByText("Rosa")).toBeTruthy();
    expect(screen.getByText("(415) 555-0100")).toBeTruthy();
    expect(screen.queryByText("Unknown contact")).toBeNull();
  });
  it("names recent callers by phone number or web call instead of unknown caller", async () => {
    await setup("en", null, { upcoming: [], recentCalls: [
      { id: "phone", startedAt: "2026-09-04T14:30:00Z", status: "completed", transport: "voice", durationSeconds: 30, contactName: null, contactPhone: "+14155550123", contactEmail: null },
      { id: "web", startedAt: "2026-09-04T15:30:00Z", status: "completed", transport: "web_voice", durationSeconds: 40, contactName: null, contactPhone: null, contactEmail: null },
    ] });
    expect(screen.getByText("(415) 555-0123")).toBeTruthy();
    expect(screen.getByText("Web caller")).toBeTruthy();
    expect(screen.queryByText(/Unknown/)).toBeNull();
  });
});
describe("session replay masking on Home", () => {
  it("masks caller names and numbers in every card that lists them", async () => {
    await setup("en", "call-123", { upcoming: [{ id: "appointment", startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", contactName: "Rosa Booker", serviceName: "Consultation" }], recentCalls: [
      { id: "phone", startedAt: "2026-09-04T14:30:00Z", status: "completed", transport: "voice", durationSeconds: 30, contactName: "Ada Caller", contactPhone: "+14155550123", contactEmail: null },
    ] });
    for (const text of ["+14165550199", "Rosa Booker", "Ada Caller", "(415) 555-0123", "AC"]) {
      expect(screen.getByText(text).closest(".ph-mask"), text).toBeTruthy();
    }
  });
});
describe("appointment requests on Home", () => {
  const cancellation = { id: "request-1", kind: "voice_message", title: "Voice message from Milan", body: "Cancellation request: Consultation, Monday, September 7 at 2:30 PM", callId: "call-1", createdAt: "2026-09-04T14:30:00Z", request: "appointment_cancellation" };
  const reschedule = { id: "reschedule-1", kind: "voice_message", title: "Voice message from Milan", body: "Reschedule request: Consultation\nNew time: Wednesday, September 9 at 10:00 AM", callId: "call-2", createdAt: "2026-09-04T14:30:00Z", request: "appointment_reschedule", requested: { service: "Consultation", startsAt: "2099-09-07T10:30", newStartsAt: "2099-09-09T10:00" } };
  const linked = { id: "appointment", startsAt: "2026-09-07T14:30:00Z", timezone: "UTC", status: "confirmed", serviceName: "Consultation", contactName: "Milan" };

  it("names the matched appointment, and leaves approving to the call the row opens", async () => {
    await setup("en", null, { role: "scheduler", actionRequired: [{ ...cancellation, appointment: linked }, { ...reschedule, appointment: linked }] });
    expect(screen.getAllByText(en.home.actionRequired.kinds.cancellation)).toHaveLength(2);
    expect(screen.getAllByText(en.home.actionRequired.kinds.reschedule)).toHaveLength(2);
    expect(screen.getAllByText("Appointment: Consultation for Milan on Mon, Sep 7, 2:30 PM")).toHaveLength(2);
    expect(screen.getByText(/New time: .*September 9/)).toBeTruthy();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(expect.arrayContaining(["/inbox?call=call-1", "/inbox?call=call-2"]));
    for (const name of [enCommon.appointments.cancel.approve, enCommon.appointments.reschedule.approve, enCommon.appointments.move.otherTime, /Reschedule appointment:/, /Cancel appointment/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("says when no appointment matched, or when it was already cancelled", async () => {
    await setup("en", null, { role: "scheduler", actionRequired: [{ ...cancellation, appointment: null }] });
    expect(screen.getByText(en.home.actionRequired.noAppointment)).toBeTruthy();
    cleanup();
    await setup("en", null, { role: "scheduler", actionRequired: [{ ...cancellation, appointment: { ...linked, status: "canceled" } }] });
    expect(screen.getByText(en.home.actionRequired.alreadyCancelled)).toBeTruthy();
    expect(screen.queryByText(en.home.actionRequired.noAppointment)).toBeNull();
  });
});

describe("Upcoming rows on Home", () => {
  it("open the appointment's details on Home, where Cancel and Reschedule live", async () => {
    await setup("en", null, { role: "scheduler" });
    const row = screen.getByRole("button", { name: /^Alex/ });
    // The row itself has no Cancel; only the sheet does.
    expect(screen.queryByRole("button", { name: /Cancel appointment/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(row);
    const sheet = await screen.findByRole("dialog");
    expect(sheet.textContent).toContain("Alex");
    expect(sheet.textContent).toContain("Consultation");
    expect(screen.getByRole("button", { name: /Cancel appointment/ })).toBeTruthy();
  });
});

describe("Home while it loads", () => {
  it("keeps the chart titles, holds the metric titles hidden, and marks each loading block busy", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const i18n = createInstance();
    await i18n.init({ lng: "en", defaultNS: "dashboard", resources: { en: { dashboard: en, common: enCommon, knowledge: enKnowledge } } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    const { container } = render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={ALL_CAPABILITIES}><LiveOverviewSurface /></BusinessCapabilitiesProvider></QueryClientProvider></I18nextProvider>);
    // The metric titles are placeholders holding their hidden text, so each card turns real together.
    for (const title of ["calls", "appointments", "averageDuration"]) expect(screen.getByText(i18n.t(`home.metrics.${title}.title`)).closest("[data-slot='skeleton']")).toBeTruthy();
    expect(screen.getByText(i18n.t("home.chart.title"))).toBeTruthy();
    expect(screen.getByText(i18n.t("home.recentCalls.title"))).toBeTruthy();
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(4);
  });

  it("holds the setup guide's place while it loads, so the page doesn't jump", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const i18n = createInstance();
    await i18n.init({ lng: "en", defaultNS: "dashboard", resources: { en: { dashboard: en, common: enCommon, knowledge: enKnowledge } } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", role: "business_owner", active: true }] });
    // The dashboard answers, while the guide, the hours and the appointments are still loading.
    client.setQueryData(["dashboard"], { businessId: "business", kpis: { calls: { total: 0, deltaPercent: 0 }, appointments: { total: 0, deltaPercent: 0 }, averageDuration: { totalSeconds: 0, deltaSeconds: 0 } }, monthlyCalls: [], recentCalls: [], actionRequired: [], upcoming: [] });
    const { container } = render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={ALL_CAPABILITIES}><LiveOverviewSurface /></BusinessCapabilitiesProvider></QueryClientProvider></I18nextProvider>);

    expect(screen.getByText(i18n.t("setupGuide.title")).closest("[data-slot='skeleton']")).toBeTruthy();
    for (const step of SETUP_STEP_ORDER) expect(screen.getByText(i18n.t(`setupGuide.steps.${step}`)).closest("[data-slot='skeleton']")).toBeTruthy();
    expect(screen.getByText(i18n.t("setupGuide.skip")).closest("[data-slot='skeleton']")).toBeTruthy();
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
  });
});
