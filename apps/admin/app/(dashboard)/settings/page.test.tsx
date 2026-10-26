import type { ReactElement } from "react";
import { expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => fixture.headers }));
// Next's redirect throws, so nothing after it runs.
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }) }));
vi.mock("@/components/first-settings-tab", () => ({ FirstSettingsTab: () => null }));

import { FirstSettingsTab } from "@/components/first-settings-tab";
import SettingsPage from "./page";

it("opens Usage on the host's domain, whose direct businesses give every tab", async () => {
  fixture.headers = new Headers({ "x-lobbystack-brand": "host" });
  await expect(SettingsPage()).rejects.toMatchObject({ to: "/settings/usage" });
});

it("on a partner's host, opens the first tab the business allows", async () => {
  fixture.headers = new Headers({ "x-lobbystack-brand": "partner:5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11", "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  expect(((await SettingsPage()) as ReactElement).type).toBe(FirstSettingsTab);
});
