import "server-only";

import type { AssignedNumberProvider } from "@lobbystack/domain";

import { getTelephony } from "./telephony";

/** What the three city-order routes give the domain: the carrier side of ordering a number by city, or giving out one the account holds. */
export function assignedNumberProvider(): AssignedNumberProvider {
  const telephony = getTelephony();
  return {
    assignsOnOrder: (countryCode) => telephony.assignedNumbers.assignsOnOrder(countryCode),
    listReusable: (search) => telephony.assignedNumbers.listReusable(search),
    take: (number) => telephony.assignedNumbers.takeReusable(number),
    order: (order) => telephony.assignedNumbers.order(order),
    release: async ({ carrier, providerPhoneId }) => { await telephony.forNumber(carrier)?.inventory?.releasePhoneNumber({ providerPhoneId }); },
  };
}
