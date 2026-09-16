import { expect, it } from "vitest";

import { isMaintenanceMode } from "./maintenance";

it("enables maintenance mode only for the explicit true flag", () => {
  expect(isMaintenanceMode({ LOBBYSTACK_MAINTENANCE_MODE: "true" })).toBe(true);
  expect(isMaintenanceMode({ LOBBYSTACK_MAINTENANCE_MODE: "TRUE" })).toBe(false);
  expect(isMaintenanceMode({ LOBBYSTACK_MAINTENANCE_MODE: "false" })).toBe(false);
  expect(isMaintenanceMode({})).toBe(false);
});
