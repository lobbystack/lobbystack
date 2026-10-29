import type { AlertSmsSender, CarrierAdapters } from "../telephony/types";

type Env = Record<string, string | undefined>;

export function createTelnyxCarrier(_env: Env = process.env): CarrierAdapters | undefined {
  return undefined;
}

export function createTelnyxAlertSms(_env: Env = process.env): AlertSmsSender | undefined {
  return undefined;
}
