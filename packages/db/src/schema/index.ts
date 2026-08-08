export * from "./auth";
export * from "./tenancy";
export * from "./catalog";
export * from "./booking";
export * from "./conversations";
export * from "./voice";
export * from "./knowledge";
export * from "./calendar";
export * from "./notifications";
export * from "./billing";
export * from "./compliance";
export * from "./affiliates";
export * from "./operations";
export * from "./_common";

import * as auth from "./auth";
import * as tenancy from "./tenancy";
import * as catalog from "./catalog";
import * as booking from "./booking";
import * as conversations from "./conversations";
import * as voice from "./voice";
import * as knowledge from "./knowledge";
import * as calendar from "./calendar";
import * as notifications from "./notifications";
import * as billing from "./billing";
import * as compliance from "./compliance";
import * as affiliates from "./affiliates";
import * as operations from "./operations";

export const schema = {
  ...auth,
  ...tenancy,
  ...catalog,
  ...booking,
  ...conversations,
  ...voice,
  ...knowledge,
  ...calendar,
  ...notifications,
  ...billing,
  ...compliance,
  ...affiliates,
  ...operations,
};
