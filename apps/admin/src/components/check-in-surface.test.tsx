// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { CheckInSurface } from "./check-in-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "fr", resolvedLanguage: "fr" }, t: (key: string) => key }) }));
vi.mock("./replacement-onboarding-shell", () => ({ ReplacementOnboardingShell: ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => <main><h1>{title}</h1><p>{description}</p>{children}</main> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("saves nothing until the owner confirms", async () => {
  const fetcher = vi.fn(async () => Response.json({ answer: "connect_number" }));
  vi.stubGlobal("fetch", fetcher);
  render(<CheckInSurface answer="connect_number" token="v1.token.sig" />);
  expect(screen.getByText("checkIn.answers.connect_number")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "checkIn.confirm.action" }));
  expect(fetcher).toHaveBeenCalledWith("/api/check-in", expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "v1.token.sig" }) }));
  await screen.findByText("checkIn.next.connect_number.title");
});

it.each([
  ["still_testing", "/"],
  ["connect_number", "https://docs.lobbystack.com/fr/getting-started/forward-calls"],
  ["test_call_mistakes", "/agent/knowledge"],
  ["not_a_fit", "https://docs.lobbystack.com/fr/agent/overview"],
] as const)("offers the next step for %s", async (answer, href) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ answer })));
  render(<CheckInSurface answer={answer} token="v1.token.sig" />);
  await userEvent.click(screen.getByRole("button", { name: "checkIn.confirm.action" }));
  expect((await screen.findByRole("button", { name: `checkIn.next.${answer}.action` })).getAttribute("href")).toBe(href);
  expect(screen.getByText("checkIn.next.reply")).toBeTruthy();
});

it("shows a plain message for a link that doesn't read", () => {
  render(<CheckInSurface answer={null} token="tampered" />);
  expect(screen.getByRole("heading", { name: "checkIn.invalid.title" })).toBeTruthy();
  expect(screen.getByText("checkIn.invalid.description")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("shows the same message when a link expires before the owner confirms", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "expired" }, { status: 400 })));
  render(<CheckInSurface answer="still_testing" token="v1.token.sig" />);
  await userEvent.click(screen.getByRole("button", { name: "checkIn.confirm.action" }));
  await screen.findByRole("heading", { name: "checkIn.invalid.title" });
});

it("lets the owner try again after a failed save", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 })).mockResolvedValueOnce(Response.json({ answer: "not_a_fit" }));
  vi.stubGlobal("fetch", fetcher);
  render(<CheckInSurface answer="not_a_fit" token="v1.token.sig" />);
  await userEvent.click(screen.getByRole("button", { name: "checkIn.confirm.action" }));
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "checkIn.confirm.action" }));
  await screen.findByText("checkIn.next.not_a_fit.title");
});
