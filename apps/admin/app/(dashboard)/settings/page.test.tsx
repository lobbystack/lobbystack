import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ capabilities: [] as string[] }));
// Next's redirect throws, so nothing after it runs.
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }) }));
vi.mock("@/lib/dashboard-request", () => ({ readDashboardRequest: async () => ({ can: (capability: string) => fixture.capabilities.includes(capability), opensPartnerBilling: false }) }));

import SettingsPage from "./page";
import WorkspacePage from "../workspace/page";

beforeEach(() => { fixture.capabilities = ["activity", "setup", "team", "billing", "api_keys", "mcp"]; });

it("opens Team for a business that gives every capability, now that Business has its own menu", async () => {
  await expect(SettingsPage()).rejects.toMatchObject({ to: "/workspace/team" });
  await expect(WorkspacePage()).rejects.toMatchObject({ to: "/workspace/team" });
});

it("opens Usage on an activity-only partner business", async () => {
  fixture.capabilities = ["activity"];
  await expect(SettingsPage()).rejects.toMatchObject({ to: "/workspace/usage" });
  await expect(WorkspacePage()).rejects.toMatchObject({ to: "/workspace/usage" });
});
