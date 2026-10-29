// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../public/locales/en/knowledge.json";
import sr from "../../public/locales/sr/knowledge.json";
import { UnansweredQuestionsSection, unansweredQuestionsQueryKey, type UnansweredQuestions } from "./unanswered-questions-section";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const listed: UnansweredQuestions = {
  openCount: 2,
  questions: [
    { id: "parking", question: "Do you validate parking?", timesAsked: 3, firstAskedAt: "2026-10-01T12:00:00Z", lastAskedAt: "2026-10-27T12:00:00Z", lastChannel: "voice" },
    { id: "dogs", question: "Can I bring my dog?", timesAsked: 1, firstAskedAt: "2026-10-20T12:00:00Z", lastAskedAt: "2026-10-20T12:00:00Z", lastChannel: "web_chat" },
  ],
};

async function setup({ data = listed, canManage = true, locale = "en" as "en" | "sr" } = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: locale, defaultNS: "knowledge", resources: { en: { knowledge: en }, sr: { knowledge: sr } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(unansweredQuestionsQueryKey("business"), data);
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(_init?.method ? { ok: true } : data));
  vi.stubGlobal("fetch", fetchMock);
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><UnansweredQuestionsSection businessId="business" canManage={canManage} /></QueryClientProvider></I18nextProvider>);
  return { fetchMock, i18n };
}

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
