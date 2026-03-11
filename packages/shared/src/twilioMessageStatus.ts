export type SmsMessageStatus =
  | "received"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed";

export type NotificationDeliveryStatus =
  | "scheduled"
  | "pending"
  | "sent"
  | "delivered"
  | "failed";

const terminalMessageStatuses = new Set<SmsMessageStatus>([
  "delivered",
  "undelivered",
  "failed",
]);

const terminalNotificationStatuses = new Set<NotificationDeliveryStatus>([
  "delivered",
  "failed",
]);

const messageStatusRank: Record<SmsMessageStatus, number> = {
  received: 0,
  queued: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  undelivered: 4,
  failed: 4,
};

const notificationStatusRank: Record<NotificationDeliveryStatus, number> = {
  scheduled: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  failed: 3,
};

export function normalizeTwilioMessageStatus(status: string | undefined): string {
  return status?.trim().toLowerCase() ?? "";
}

export function mapTwilioStatusToMessageStatus(status: string | undefined): SmsMessageStatus {
  switch (normalizeTwilioMessageStatus(status)) {
    case "receiving":
    case "received":
      return "received";
    case "accepted":
    case "scheduled":
    case "queued":
      return "queued";
    case "sending":
      return "sending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "canceled":
    case "failed":
      return "failed";
    default:
      return "queued";
  }
}

export function mapTwilioStatusToNotificationStatus(
  status: string | undefined,
): NotificationDeliveryStatus {
  switch (normalizeTwilioMessageStatus(status)) {
    case "delivered":
      return "delivered";
    case "canceled":
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return "sent";
  }
}

export function shouldApplyMessageStatusTransition(
  currentStatus: string | undefined,
  nextStatus: SmsMessageStatus,
): boolean {
  const normalizedCurrent = currentStatus as SmsMessageStatus | undefined;
  if (!normalizedCurrent) {
    return true;
  }

  if (terminalMessageStatuses.has(normalizedCurrent)) {
    return false;
  }

  if (terminalMessageStatuses.has(nextStatus)) {
    return true;
  }

  return messageStatusRank[nextStatus] > messageStatusRank[normalizedCurrent];
}

export function shouldApplyNotificationStatusTransition(
  currentStatus: string | undefined,
  nextStatus: NotificationDeliveryStatus,
): boolean {
  const normalizedCurrent = currentStatus as NotificationDeliveryStatus | undefined;
  if (!normalizedCurrent) {
    return true;
  }

  if (terminalNotificationStatuses.has(normalizedCurrent)) {
    return false;
  }

  if (terminalNotificationStatuses.has(nextStatus)) {
    return true;
  }

  return notificationStatusRank[nextStatus] > notificationStatusRank[normalizedCurrent];
}
