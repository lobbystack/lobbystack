// Seeds two local test owners for trying the new navigation by hand:
//   nav-single@example.test  one receptionist
//   nav-multi@example.test   two receptionists, staff turned on
// Both use NAVIGATION_TEST_PASSWORD from e2e/fixtures/navigation-operator.ts.
// Local databases only: pnpm --filter @lobbystack/admin exec tsx scripts/seed-navigation-demo.ts
import { fileURLToPath } from "node:url";

import { seedNavigationOperator } from "../e2e/fixtures/navigation-operator";

const root = fileURLToPath(new URL("../../..", import.meta.url));
for (const file of [`${root}/.env.local`, `${root}/.env`]) {
  try { process.loadEnvFile(file); } catch { /* optional file */ }
}

const databaseUrl = process.env.LOBBYSTACK_MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL;
const single = await seedNavigationOperator({ databaseUrl, email: "nav-single@example.test", businessName: "Maple Dental" });
const multi = await seedNavigationOperator({ databaseUrl, email: "nav-multi@example.test", businessName: "Northside Clinic", staffEnabled: true, receptionists: ["After hours"] });
console.log(JSON.stringify({ single: { email: single.email, businessId: single.businessId }, multi: { email: multi.email, businessId: multi.businessId } }, null, 2));
