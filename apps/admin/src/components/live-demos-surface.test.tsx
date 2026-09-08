// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveDemosSurface } from "./live-demos-surface";

const translation = vi.hoisted(() => ({ i18n: { language: "fr" }, t: (key: string) => key }));
vi.mock("react-i18next", () => ({ useTranslation: () => translation }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const demo = { demoId: "demo", businessName: "Clinic", websiteUrl: "https://example.invalid", status: "preparing", suggestedPrompts: ["Hours?"], websiteIngestionStatus: "completed", snapshotReady: true, greetingReady: true, promptsReady: true };
async function fillForm() {
  await userEvent.type(screen.getByLabelText("operator.businessName"), "Clinic");
  await userEvent.type(screen.getByLabelText("operator.websiteUrl"), "https://example.invalid");
  await userEvent.type(screen.getByLabelText("operator.suggestedPrompts"), "Hours?");
}
describe("prospect demo operator mutations", () => {
  it("resets the captured form after asynchronous creation and retains its new link", async () => {
    let created = false;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { await Promise.resolve(); created = true; return Response.json({ demoId: "demo", token: "fixture-token" }); }
      return Response.json({ demos: created ? [demo] : [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDemosSurface />);
    await screen.findByText("operator.empty");
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "operator.create" }));
    await screen.findByRole("button", { name: "operator.openLink" });
    expect((screen.getByLabelText("operator.businessName") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/demos", expect.objectContaining({ body: JSON.stringify({ name: "Clinic", websiteUrl: "https://example.invalid", greeting: "", locale: "fr", suggestedPrompts: ["Hours?"] }) }));
    expect(screen.getByRole("button", { name: "operator.publish" }).hasAttribute("disabled")).toBe(false);
  });
  it("keeps form values and releases pending controls after a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method === "POST") throw new TypeError("Failed to fetch"); return Response.json({ demos: [] }); }));
    render(<LiveDemosSurface />);
    await screen.findByText("operator.empty");
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "operator.create" }));
    expect((await screen.findByRole("alert")).textContent).toBe("operator.errors.create");
    expect((screen.getByLabelText("operator.businessName") as HTMLInputElement).value).toBe("Clinic");
    expect(screen.getByRole("button", { name: "operator.create" }).hasAttribute("disabled")).toBe(false);
  });
  it("allows refreshing again after a list request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Offline")).mockResolvedValue(Response.json({ demos: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveDemosSurface />);
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "operator.refresh" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: "operator.refresh" }).hasAttribute("disabled")).toBe(false);
  });
  it.each(["rotate", "publish", "revoke"])("releases controls when %s fails", async action => {
    let hasToken = false;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        if (action === "publish" && !hasToken) { hasToken = true; return Response.json({ token: "fixture-token" }); }
        throw new TypeError("Offline");
      }
      return Response.json({ demos: [demo] });
    }));
    render(<LiveDemosSurface />);
    await screen.findByText("Clinic");
    if (action === "publish") { await userEvent.click(screen.getByRole("button", { name: "operator.rotate" })); await waitFor(() => expect(screen.getByRole("button", { name: "operator.publish" }).hasAttribute("disabled")).toBe(false)); }
    await userEvent.click(screen.getByRole("button", { name: `operator.${action}` }));
    expect((await screen.findByRole("alert")).textContent).toBe(`operator.errors.${action}`);
    expect(screen.getByRole("button", { name: "operator.rotate" }).hasAttribute("disabled")).toBe(false);
  });
});
