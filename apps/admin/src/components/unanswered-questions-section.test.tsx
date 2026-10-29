// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../public/locales/en/knowledge.json";
import enCommon from "../../public/locales/en/common.json";
import es from "../../public/locales/es/knowledge.json";
import fr from "../../public/locales/fr/knowledge.json";
import sr from "../../public/locales/sr/knowledge.json";
import { UnansweredQuestionsSection, unansweredQuestionsQueryKey, type UnansweredQuestions } from "./unanswered-questions-section";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });

const listed: UnansweredQuestions = {
  openCount: 2,
  questions: [
    { id: "parking", question: "Do you validate parking?", timesAsked: 3, firstAskedAt: "2026-10-01T12:00:00Z", lastAskedAt: "2026-10-27T12:00:00Z", lastChannel: "voice" },
    { id: "dogs", question: "Can I bring my dog?", timesAsked: 1, firstAskedAt: "2026-10-20T12:00:00Z", lastAskedAt: "2026-10-20T12:00:00Z", lastChannel: "web_chat" },
  ],
};

type Setup = { strings?: typeof en; data?: UnansweredQuestions; canManage?: boolean; locale?: "en" | "fr" | "es" | "sr"; patch?: () => Response; layoutSettled?: boolean; cached?: boolean };
async function setup({ strings = en, data = listed, canManage = true, locale = "en", patch = () => Response.json({ ok: true }), layoutSettled, cached = true }: Setup = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "knowledge", interpolation: { escapeValue: false }, resources: { en: { knowledge: strings, common: enCommon }, fr: { knowledge: fr }, es: { knowledge: es }, sr: { knowledge: sr } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  if (cached) client.setQueryData(unansweredQuestionsQueryKey("business"), data);
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method ? patch() : Response.json(data));
  vi.stubGlobal("fetch", fetchMock);
  const view = (settled?: boolean) => <I18nextProvider i18n={i18n}><QueryClientProvider client={client}><UnansweredQuestionsSection businessId="business" canManage={canManage} {...(settled === undefined ? {} : { layoutSettled: settled })} /></QueryClientProvider></I18nextProvider>;
  const { rerender } = render(view(layoutSettled));
  return { fetchMock, i18n, client, settle: () => rerender(view(true)), rerender: (settled: boolean) => rerender(view(settled)) };
}
const listRequests = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([, init]) => !(init as RequestInit | undefined)?.method);

describe("unanswered questions on the knowledge page", () => {
  it("lists open questions in the order the server ranks them, with how often and when they were last asked", async () => {
    await setup();
    expect(screen.getAllByText(/\?$/u).map((element) => element.textContent)).toEqual(["Do you validate parking?", "Can I bring my dog?"]);
    expect(screen.getByText("Asked 3 times · Last asked Oct 27, 2026")).toBeTruthy();
    expect(screen.getByText("Asked 1 time · Last asked Oct 20, 2026")).toBeTruthy();
  });

  it("formats dates and plurals in Serbian Latin script", async () => {
    await setup({ locale: "sr" });
    const line = screen.getByText(/^Postavljeno 3 puta · Poslednji put /u).textContent!;
    expect(line).toContain("27.");
    expect(line).not.toMatch(/\p{Script=Cyrillic}/u);
  });

  it("saves an answer for the question it was written for", async () => {
    const { fetchMock } = await setup();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Answer" })[0]!);
    const save = screen.getByRole("button", { name: "Save Answer" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByRole("textbox", { name: "Answer to: Do you validate parking?" }), "Two hours free at the front desk.");
    await user.click(save);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/questions/parking?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "answer", answer: "Two hours free at the front desk." }) })));
  });

  it("dismisses a question", async () => {
    const { fetchMock } = await setup();
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Dismiss" })[1]!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/questions/dogs?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "dismiss" }) })));
  });

  it.each([["fr", "Posée 3 fois · Dernière fois le "], ["es", "Preguntada 3 veces · Última vez el "]] as const)("joins how often and when in %s", async (locale, start) => {
    await setup({ locale });
    expect(screen.getByText((text) => text.startsWith(start))).toBeTruthy();
  });

  it("lets each language order and join how often and when", async () => {
    await setup({ strings: { ...en, unansweredQuestions: { ...en.unansweredQuestions, askedSummary: "{{lastAsked}} / {{asked}}" } } });
    expect(screen.getByText("Last asked Oct 27, 2026 / Asked 3 times")).toBeTruthy();
  });

  it("refreshes the list and says so when someone else already answered the question", async () => {
    const { fetchMock } = await setup({ patch: () => Response.json({ error: "This question was already answered or dismissed.", code: "question_resolved" }, { status: 409 }) });
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Answer" })[0]!);
    await user.type(screen.getByRole("textbox", { name: "Answer to: Do you validate parking?" }), "Two hours free.");
    await user.click(screen.getByRole("button", { name: "Save Answer" }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(en.unansweredQuestions.toast.alreadyHandled));
    await waitFor(() => expect(listRequests(fetchMock)).toHaveLength(1));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("refreshes the list and says so when someone else already dismissed the question", async () => {
    const { fetchMock } = await setup({ patch: () => Response.json({ error: "This question was already answered or dismissed.", code: "question_resolved" }, { status: 409 }) });
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Dismiss" })[0]!);
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(en.unansweredQuestions.toast.alreadyHandled));
    await waitFor(() => expect(listRequests(fetchMock)).toHaveLength(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says at the answer box when the answer is too long, and keeps the draft", async () => {
    await setup({ patch: () => Response.json({ error: "Answers can be up to 5000 characters.", code: "answer_too_long" }, { status: 400 }) });
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Answer" })[0]!);
    const box = screen.getByRole("textbox", { name: "Answer to: Do you validate parking?" });
    await user.type(box, "Two hours free.");
    await user.click(screen.getByRole("button", { name: "Save Answer" }));
    const message = await screen.findByRole("alert");
    expect(message.textContent).toBe("Shorten your answer to 5,000 characters or fewer.");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe(message.id);
    expect((box as HTMLTextAreaElement).value).toBe("Two hours free.");
    expect(toast.error).not.toHaveBeenCalled();
    await user.type(box, "!");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the generic error for any other failure", async () => {
    await setup({ patch: () => Response.json({ error: "Boom." }, { status: 500 }) });
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Dismiss" })[0]!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(enCommon.errors.unexpected));
  });

  it("scrolls into view once, after the content above it loads, when the page opens on its anchor", async () => {
    window.history.replaceState(null, "", "/agent/knowledge#unanswered-questions");
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { settle, rerender } = await setup({ layoutSettled: false });
    expect(scrollIntoView).not.toHaveBeenCalled();
    settle();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("unanswered-questions"));
    rerender(false);
    rerender(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("waits for its own list before scrolling", async () => {
    window.history.replaceState(null, "", "/agent/knowledge#unanswered-questions");
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await setup({ cached: false });
    expect(scrollIntoView).not.toHaveBeenCalled();
    await screen.findByText("Do you validate parking?");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("leaves the scroll alone without its anchor", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await setup();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("shows teammates who can't edit knowledge the questions without actions", async () => {
    await setup({ canManage: false });
    expect(screen.getByText("Do you validate parking?")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says what will show up here when nothing is open", async () => {
    await setup({ data: { questions: [], openCount: 0 } });
    expect(screen.getByText("No unanswered questions")).toBeTruthy();
    expect(screen.getByText(en.unansweredQuestions.emptyDescription)).toBeTruthy();
  });
});
