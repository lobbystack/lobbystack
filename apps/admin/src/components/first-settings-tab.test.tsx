// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ replace: vi.fn(), capabilities: [] as string[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: fixture.replace }) }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => fixture.capabilities.includes(capability) }));

import { FirstSettingsTab } from "./first-settings-tab";

afterEach(() => { cleanup(); fixture.replace.mockClear(); });

it.each([
  [["activity", "setup", "team", "billing", "api_keys", "mcp"], "/settings/usage"],
  [["activity", "setup", "team"], "/settings/usage"],
  [["activity"], "/settings/usage"],
  [[], "/settings/account"],
])("opens the first Settings tab the business gives the person (%j)", (capabilities, tab) => {
  fixture.capabilities = capabilities;
  render(<FirstSettingsTab />);
  expect(fixture.replace).toHaveBeenCalledWith(tab);
});
