import { isMaintenanceMode } from "@lobbystack/shared";

export type WorkerStartupMode = {
  maintenanceMode: boolean;
  startsConsumers: boolean;
};

/** This is sampled once during boot; it does not pause work already claimed by another process. */
export function getWorkerStartupMode(environment: Readonly<Record<string, string | undefined>>): WorkerStartupMode {
  const maintenanceMode = isMaintenanceMode(environment);
  return { maintenanceMode, startsConsumers: !maintenanceMode };
}
