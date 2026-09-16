import { expect, it } from "vitest";

import { getWorkerStartupMode } from "./maintenance";

it("isolates worker consumers when maintenance is enabled at startup", () => {
  expect(getWorkerStartupMode({ LOBBYSTACK_MAINTENANCE_MODE: "true" })).toEqual({
    maintenanceMode: true,
    startsConsumers: false,
  });
});

it("starts consumers when maintenance is not explicitly enabled", () => {
  expect(getWorkerStartupMode({ LOBBYSTACK_MAINTENANCE_MODE: "false" })).toEqual({
    maintenanceMode: false,
    startsConsumers: true,
  });
});
