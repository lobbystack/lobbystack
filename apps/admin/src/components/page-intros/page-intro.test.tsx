// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_INTRO_IDS, type PageIntroId, type PageIntroKey } from "@lobbystack/shared";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { setTestCallActive } from "@/lib/test-window";
import common from "../../../public/locales/en/common.json";
import intros from "../../../public/locales/en/intros.json";
import frIntros from "../../../public/locales/fr/intros.json";
import { PageIntro } from "./page-intro";
import { PageIntrosProvider } from "./page-intros-provider";
import { PAGE_INTROS } from "./pages";

const navigation = vi.hoisted(() => ({ pathname: "/inbox" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
const branding = vi.hoisted(() => ({ partner: null as null | { id: string } }));
vi.mock("@/components/branding-provider", () => ({ useBranding: () => branding }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  navigation.pathname = "/inbox";
  branding.partner = null;
  telemetryRef.current = createRecordedBrowserTelemetry();
  fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); setTestCallActive(false); vi.unstubAllGlobals(); });

async function i18n(language = "en") {
  const instance = createInstance();
  await instance.init({ lng: language, fallbackLng: "en", resources: { en: { common, intros }, fr: { intros: frIntros } }, interpolation: { escapeValue: false } });
  return instance;
}

async function renderPages(pages: PageIntroId[], seen: readonly PageIntroKey[] | null = ["dashboard"], language = "en") {
  const instance = await i18n(language);
  const tree = (current: PageIntroId[]) => (
    <I18nextProvider i18n={instance}>
      <PageIntrosProvider businessId="business" seen={seen}>{current.map((page) => <PageIntro key={page} page={page} />)}</PageIntrosProvider>
    </I18nextProvider>
  );
  const view = render(tree(pages));
  return { ...view, show: (next: PageIntroId[]) => view.rerender(tree(next)) };
}

const posted = () => fetchMock.mock.calls.filter(([url]) => url === "/api/page-intros").map(([, init]) => JSON.parse((init as RequestInit).body as string) as { intro: string });

describe("a page's intro card", () => {
  it("opens with the page's picture, title, lines and buttons, and reports showing", async () => {
    await renderPages(["inbox"]);
    const dialog = await screen.findByRole("dialog", { name: intros.pages.inbox.title });
    for (const line of [intros.pages.inbox.what, intros.pages.inbox.does, intros.pages.inbox.how]) expect(within(dialog).getByText(line)).toBeTruthy();
    // Focus lands on Get started, so Enter closes the card.
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: intros.actions.getStarted })));
    expect(within(dialog).getByRole("link", { name: intros.actions.readGuide }).getAttribute("href")).toBe("https://docs.lobbystack.com/dashboard/inbox");
    // The picture is decoration, out of reach of the keyboard and screen readers.
    const picture = dialog.querySelector(".page-intro-scene")!;
    expect(picture.getAttribute("aria-hidden")).toBe("true");
    expect(picture.hasAttribute("inert")).toBe(true);
    telemetryRef.current!.expectEvent("web.page.intro_shown", { businessId: "business", pageId: "inbox" });
    // The entrance holds still for people who ask for less motion.
    expect(dialog.className).toContain("motion-reduce:animate-none");
  });

  it("closes on Get started, records it for the person and reports how", async () => {
    await renderPages(["inbox"]);
    await userEvent.click(await screen.findByRole("button", { name: intros.actions.getStarted }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted()).toEqual([{ intro: "inbox" }]);
    telemetryRef.current!.expectEvent("web.page.intro_dismissed", { businessId: "business", pageId: "inbox", method: "get_started" });
  });

  it.each([
    ["the X", "close", async () => userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: common.accessibility.close }))],
    ["Escape", "escape", async () => userEvent.keyboard("{Escape}")],
    ["a click outside", "outside", async () => userEvent.click(document.querySelector('[data-slot="dialog-overlay"]')!)],
  ] as const)("closes on %s and counts as seen", async (_name, method, close) => {
    await renderPages(["inbox"]);
    await screen.findByRole("dialog");
    await close();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted()).toEqual([{ intro: "inbox" }]);
    telemetryRef.current!.expectEvent("web.page.intro_dismissed", { businessId: "business", pageId: "inbox", method });
  });

  it("stays closed on a page the person already closed it on", async () => {
    await renderPages(["inbox"], ["dashboard", "inbox"]);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(telemetryRef.current!.events).toEqual([]);
  });

  it("opens one card per visit, and the next visit opens the next page's", async () => {
    const first = await renderPages(["inbox"]);
    await userEvent.click(await screen.findByRole("button", { name: intros.actions.getStarted }));
    navigation.pathname = "/business/knowledge";
    first.show(["knowledge"]);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    first.unmount();

    // A reload starts a new visit with the list the server now holds.
    await renderPages(["knowledge"], ["dashboard", "inbox"]);
    expect(await screen.findByRole("dialog", { name: intros.pages.knowledge.title })).toBeTruthy();
  });

  it("skips the first page of the person's first visit, records the visit, and opens on the next page", async () => {
    navigation.pathname = "/";
    const view = await renderPages(["inbox"], []);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(posted()).toEqual([{ intro: "dashboard" }]);

    navigation.pathname = "/inbox";
    view.show(["inbox"]);
    expect(await screen.findByRole("dialog", { name: intros.pages.inbox.title })).toBeTruthy();
  });

  it("never opens during onboarding or a test call", async () => {
    navigation.pathname = "/onboarding/meet";
    const view = await renderPages(["inbox"]);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();

    navigation.pathname = "/inbox";
    setTestCallActive(true);
    await renderPages(["inbox"]);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows nothing when the closed cards couldn't be read", async () => {
    await renderPages(["inbox"], null);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("links the guide in the reader's language and leaves it out on a partner's dashboard", async () => {
    const french = await renderPages(["rules"], ["dashboard"], "fr");
    expect((await screen.findByRole("link", { name: frIntros.actions.readGuide })).getAttribute("href")).toBe("https://docs.lobbystack.com/fr/agent/rules");
    french.unmount();

    branding.partner = { id: "partner" };
    await renderPages(["rules"]);
    await screen.findByRole("dialog");
    expect(screen.queryByRole("link", { name: intros.actions.readGuide })).toBeNull();
    expect(screen.getByRole("button", { name: intros.actions.getStarted })).toBeTruthy();
  });

  it("closes on the guide link too", async () => {
    await renderPages(["services"]);
    await userEvent.click(await screen.findByRole("link", { name: intros.actions.readGuide }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    telemetryRef.current!.expectEvent("web.page.intro_dismissed", { businessId: "business", pageId: "services", method: "guide" });
  });

  it.each(PAGE_INTRO_IDS)("has copy, a picture and a guide for %s", async (page) => {
    await renderPages([page]);
    const dialog = await screen.findByRole("dialog");
    const copy = intros.pages[page] as Record<string, string>;
    expect(within(dialog).getByRole("heading", { name: copy.title! })).toBeTruthy();
    const lines = PAGE_INTROS[page].lines;
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(within(dialog).getAllByRole("listitem").map((item) => item.textContent)).toEqual(lines.map(({ key }) => copy[key]));
    expect(dialog.querySelector(".page-intro-scene")?.textContent).not.toBe("");
    expect(PAGE_INTROS[page].guide).toMatch(/^\/[a-z-]+\/[a-z-]+$/);
  });
});
