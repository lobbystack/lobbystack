// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestAuthCard } from "./guest-auth-card";
import { rememberedPlan } from "@/lib/remembered-plan";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
const analytics = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/auth-success-analytics", () => ({ recordAuthSuccess: analytics.record }));
vi.mock("./auth-card", () => ({ AuthCard: ({ mode, google, passkey }: { mode: string; google: boolean; passkey?: boolean }) => <div>{mode} form{google ? " with Google" : ""}{passkey ? " with passkey" : ""}</div> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });

function stubFetch(session: unknown, google = false, passkey = false) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url === "/api/auth/providers" ? { google, passkey } : session)));
}

it.each(["login", "signup"] as const)("redirects an authenticated %s visitor without showing the form", async mode => {
  stubFetch({ user: { id: "user" }, session: { id: "session" } });
  window.history.replaceState(null, "", "/?returnTo=%2Fsettings");
  render(<GuestAuthCard mode={mode} />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/settings"));
  expect(screen.queryByText(`${mode} form`)).toBeNull();
  expect(fetch).toHaveBeenCalledWith("/api/auth/get-session", expect.objectContaining({ cache: "no-store", credentials: "include" }));
  expect(analytics.record).not.toHaveBeenCalled();
});

it.each(["https://example.com", "/fr/login", "/en/signup"])("avoids unsafe or looping return target %s", async target => {
  stubFetch({ user: { id: "user" }, session: { id: "session" } });
  window.history.replaceState(null, "", `/?returnTo=${encodeURIComponent(target)}`);
  render(<GuestAuthCard mode="login" />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/"));
});

it.each([false, true])("shows the form for an absent session or failed request (%s)", async fails => {
  if (fails) vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  else stubFetch(null);
  render(<GuestAuthCard mode="login" />);
  expect(await screen.findByText("login form")).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("offers Google when the server has its OAuth client", async () => {
  stubFetch(null, true);
  render(<GuestAuthCard mode="signup" />);
  expect(await screen.findByText("signup form with Google")).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith("/api/auth/providers");
});

it("offers passkeys when the server says this host allows them", async () => {
  stubFetch(null, false, true);
  render(<GuestAuthCard mode="login" />);
  expect(await screen.findByText("login form with passkey")).toBeTruthy();
});

it.each(["login", "signup"] as const)("records a finished Google %s with its source, then follows returnTo", async event => {
  stubFetch({ user: { id: "user" }, session: { id: "session" } });
  window.history.replaceState(null, "", `/en/signup?returnTo=%2Fagent&source=calculator&plan=pro&google=${event}`);
  render(<GuestAuthCard mode="signup" />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/agent"));
  expect(analytics.record).toHaveBeenCalledExactlyOnceWith(`web.auth.${event}_succeeded`, { method: "google", source: "calculator" });
});

describe("the plan picked on the pricing page", () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it("is kept as soon as signup loads, before the session check answers", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    window.history.replaceState(null, "", "/en/signup?plan=pro");
    render(<GuestAuthCard mode="signup" />);
    expect(rememberedPlan()).toBe("pro");
  });

  it.each(["enterprise", ""])("ignores a plan the pricing page doesn't sell (%s)", plan => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    window.history.replaceState(null, "", `/en/signup?plan=${plan}`);
    render(<GuestAuthCard mode="signup" />);
    expect(rememberedPlan()).toBeNull();
  });

  it("still shows signup when the browser blocks storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    stubFetch(null);
    window.history.replaceState(null, "", "/en/signup?plan=starter");
    render(<GuestAuthCard mode="signup" />);
    expect(await screen.findByText("signup form")).toBeTruthy();
    expect(rememberedPlan()).toBeNull();
  });
});
