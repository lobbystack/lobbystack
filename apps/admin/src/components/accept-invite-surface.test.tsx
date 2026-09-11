// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AcceptInviteSurface } from "./accept-invite-surface";

const spies = vi.hoisted(() => ({ success: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("sonner", () => ({ toast: spies }));
vi.mock("next/navigation", () => ({ useRouter: () => spies }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.history.replaceState({}, "", "/"); });

it("preserves main's success toast and navigates to team settings after accepting", async () => {
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("get-session")) return Response.json({ user: { id: "fixture" } });
    if (init?.method === "POST") return Response.json({ businessId: "business", alreadyMember: false });
    return Response.json({ invitation: { businessName: "Clinic", email: "invitee@example.invalid", expired: false, status: "pending" } });
  }));
  render(<AcceptInviteSurface />);
  const submit = await screen.findByRole("button", { name: "acceptInvite.submit" });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  await userEvent.click(submit);
  await waitFor(() => expect(spies.success).toHaveBeenCalledWith("acceptInvite.success"));
  expect(spies.replace).toHaveBeenCalledWith("/settings/team");
  expect(screen.queryByText("acceptInvite.success")).toBeNull();
});

it("settles a failed preview into the original invalid-link state", async () => {
  window.history.replaceState({}, "", "/accept-invite?token=fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("get-session")) return Response.json({ user: { id: "fixture" } });
    throw new Error("Offline");
  }));
  render(<AcceptInviteSurface />);
  await screen.findByText("acceptInvite.invalidLink");
  expect((await screen.findByRole("button", { name: "acceptInvite.submit" })).hasAttribute("disabled")).toBe(true);
});
