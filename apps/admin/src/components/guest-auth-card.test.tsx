// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GuestAuthCard } from "./guest-auth-card";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./auth-card", () => ({ AuthCard: ({ mode }: { mode: string }) => <div>{mode} form</div> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });

it.each(["login", "signup"] as const)("redirects an authenticated %s visitor without showing the form", async mode => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ user: { id: "user" }, session: { id: "session" } })));
  window.history.replaceState(null, "", "/?returnTo=%2Fsettings");
  render(<GuestAuthCard mode={mode} />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/settings"));
  expect(screen.queryByText(`${mode} form`)).toBeNull();
  expect(fetch).toHaveBeenCalledWith("/api/auth/get-session", expect.objectContaining({ cache: "no-store", credentials: "include" }));
});

it.each(["https://example.com", "/fr/login", "/en/signup"])("avoids unsafe or looping return target %s", async target => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ user: { id: "user" }, session: { id: "session" } })));
  window.history.replaceState(null, "", `/?returnTo=${encodeURIComponent(target)}`);
  render(<GuestAuthCard mode="login" />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/"));
});

it.each([false, true])("shows the form for an absent session or failed request (%s)", async fails => {
  vi.stubGlobal("fetch", fails ? vi.fn().mockRejectedValue(new Error("offline")) : vi.fn().mockResolvedValue(Response.json(null)));
  render(<GuestAuthCard mode="login" />);
  expect(await screen.findByText("login form")).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
});
