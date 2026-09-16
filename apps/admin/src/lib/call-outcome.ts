import type { CallOutcome } from "../../../../packages/domain/src/server/callOutcome";
import { formatDateTime } from "./locale";
import type { TFunction } from "i18next";

export function formatCallDispositionSummary(
  disposition: string,
  t: TFunction<"calls">,
): string {
  const normalized = disposition.trim().toLowerCase();

  if (normalized.includes("contact_blocked")) {
    return t("outcome.contactBlocked");
  }
  if (normalized.includes("abuse")) {
    return t("outcome.abuse");
  }
  if (normalized.includes("spam")) {
    return t("outcome.spam");
  }
  if (normalized.includes("transfer_completed")) {
    return t("outcome.transferCompleted");
  }
  if (normalized.includes("transfer_busy")) {
    return t("outcome.transferBusy");
  }
  if (normalized.includes("transfer_")) {
    return t("outcome.transferFailed");
  }
  if (normalized.includes("voicemail")) {
    return t("outcome.voicemail");
  }
  if (normalized.includes("busy")) {
    return t("outcome.busy");
  }
  if (normalized.includes("no_answer") || normalized.includes("missed")) {
    return t("outcome.noAnswer");
  }
  if (normalized.includes("stream_start_failed") || normalized.includes("openai_handshake_failed")) {
    return t("outcome.technicalIssue");
  }
  if (normalized.includes("failed")) {
    return t("outcome.technicalIssue");
  }
  if (normalized.includes("canceled") || normalized.includes("cancelled")) {
    return t("outcome.canceled");
  }
  if (normalized.includes("completed")) {
    return t("outcome.completed");
  }

  return t("outcome.none");
}

export function formatCallOutcomeSummary(
  outcome: CallOutcome | undefined,
  locale: string,
  t: TFunction<"calls">,
): string {
  if (!outcome) {
    return t("outcome.none");
  }

  switch (outcome.kind) {
    case "booked":
      return t("outcome.booked", {
        serviceName: outcome.serviceName ?? t("outcome.genericService"),
        startsAt: outcome.startsAt
          ? formatDateTime(outcome.startsAt, locale, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : t("outcome.unspecifiedTime"),
      });
    case "booking_in_progress":
      if (outcome.serviceName && outcome.startsAt) {
        return t("outcome.schedulingWithServiceAndTime", {
          serviceName: outcome.serviceName,
          startsAt: formatDateTime(outcome.startsAt, locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        });
      }
      if (outcome.serviceName) {
        return t("outcome.schedulingWithService", {
          serviceName: outcome.serviceName,
        });
      }
      return t("outcome.scheduling");
    case "message_taking":
      return t("outcome.messageTaken");
    case "summary":
      return outcome.summary ?? t("outcome.none");
    case "disposition":
      return outcome.disposition
        ? formatCallDispositionSummary(outcome.disposition, t)
        : t("outcome.none");
    default:
      return t("outcome.none");
  }
}

