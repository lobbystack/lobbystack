// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsShell } from "./settings-shell";
import SettingsPage from "../../app/(dashboard)/settings/page";
const route = vi.hoisted(() => ({ pathname: "/settings/usage", redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, redirect: route.redirect }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("original settings route shell", () => {
  it("redirects the settings index to usage", () => { SettingsPage(); expect(route.redirect).toHaveBeenCalledWith("/settings/usage"); });
  it("renders the shared header and route-backed original subnavigation", () => {
    route.pathname = "/settings/usage";
    render(<SettingsShell><p>Settings content</p></SettingsShell>);
    expect(screen.getByRole("heading", { name: "header.title" })).toBeTruthy();
    const paths = ["usage", "plan", "team", "phone-number", "appearance", "notifications", "api-keys", "connected-apps"];
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(paths.map(path => `/settings/${path}`));
    expect(screen.getByRole("link", { name: "sections.usage" }).className).toContain("bg-muted");
  });
  it("leaves the website widget out of Settings", () => {
    route.pathname = "/settings/usage";
    render(<SettingsShell><p>Settings content</p></SettingsShell>);
    expect(screen.queryByRole("link", { name: "sections.widget" })).toBeNull();
  });
});
