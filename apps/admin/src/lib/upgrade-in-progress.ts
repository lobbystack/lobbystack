/**
 * Someone choosing a plan, waiting for checkout, or on their way to it is not
 * leaving. The upgrade provider is the only writer; surfaces that would read a
 * departure into the pointer leaving the window check this first.
 */
let upgrading = false;

export function setUpgradeInProgress(active: boolean): void {
  upgrading = active;
}

export function isUpgradeInProgress(): boolean {
  return upgrading;
}
