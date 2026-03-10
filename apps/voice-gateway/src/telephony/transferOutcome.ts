export type TransferOutcome = {
  transferState: "completed" | "failed";
  callStatus: "transferred" | "completed";
  disposition: string;
};

function normalizeDialStatus(status: string | undefined): string {
  return status?.trim().toLowerCase() ?? "unknown";
}

export function mapDialCallStatusToTransferOutcome(
  dialCallStatus: string | undefined,
): TransferOutcome {
  const normalized = normalizeDialStatus(dialCallStatus);

  switch (normalized) {
    case "completed":
    case "answered":
      return {
        transferState: "completed",
        callStatus: "transferred",
        disposition: `transfer_${normalized}`,
      };
    case "busy":
    case "canceled":
    case "failed":
    case "no-answer":
      return {
        transferState: "failed",
        callStatus: "completed",
        disposition: `transfer_${normalized}`,
      };
    default:
      return {
        transferState: "failed",
        callStatus: "completed",
        disposition: "transfer_unknown",
      };
  }
}
