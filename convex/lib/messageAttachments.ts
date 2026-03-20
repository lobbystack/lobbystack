import type { Id } from "../_generated/dataModel";

export const MAX_SMS_REPLY_ATTACHMENTS = 3;
export const MAX_MMS_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_SMS_ATTACHMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_DOWNLOAD_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const DIRECT_MMS_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export const LINK_ONLY_CONTENT_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

export type ResolvedAttachmentDeliveryMode = "mms" | "link";

export type ResolvedAttachment = {
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  byteLength: number;
  deliveryMode: ResolvedAttachmentDeliveryMode;
};

export function isSupportedAttachmentContentType(contentType: string): boolean {
  return DIRECT_MMS_CONTENT_TYPES.has(contentType) || LINK_ONLY_CONTENT_TYPES.has(contentType);
}

export function canDeliverAsMms(contentType: string): boolean {
  return DIRECT_MMS_CONTENT_TYPES.has(contentType);
}

export function isImageAttachment(contentType?: string | null): boolean {
  return Boolean(contentType?.startsWith("image/"));
}

export function normalizeAttachmentFileName(fileName: string, fallbackExtension = "bin"): string {
  const withoutPath = fileName.split(/[\\/]/).pop() ?? fileName;
  const trimmed = withoutPath.trim();
  if (trimmed.length === 0) {
    return `attachment.${fallbackExtension}`;
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9._-]+/g, "-");
  return sanitized.length > 0 ? sanitized : `attachment.${fallbackExtension}`;
}

export function inferFileNameFromContentType(contentType?: string | null): string {
  switch (contentType) {
    case "image/jpeg":
    case "image/jpg":
      return "image.jpg";
    case "image/png":
      return "image.png";
    case "image/gif":
      return "image.gif";
    case "image/heic":
      return "image.heic";
    case "image/heif":
      return "image.heif";
    case "application/pdf":
      return "document.pdf";
    case "application/msword":
      return "document.doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "document.docx";
    case "application/vnd.ms-excel":
      return "spreadsheet.xls";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "spreadsheet.xlsx";
    case "text/csv":
      return "data.csv";
    default:
      return "attachment.bin";
  }
}

export function formatAttachmentDisplayName(input: {
  fileName?: string | null;
  contentType?: string | null;
  index: number;
}): string {
  if (input.fileName?.trim()) {
    return input.fileName;
  }

  const generated = inferFileNameFromContentType(input.contentType);
  if (generated !== "attachment.bin") {
    return generated;
  }

  return `Attachment ${input.index + 1}`;
}

export function resolveAttachmentDeliveryModes(
  attachments: Array<Pick<ResolvedAttachment, "storageId" | "fileName" | "contentType" | "byteLength">>,
): Array<ResolvedAttachment> {
  const resolved: Array<ResolvedAttachment> = attachments.map((attachment) => ({
    ...attachment,
    deliveryMode: canDeliverAsMms(attachment.contentType)
      ? ("mms" as const)
      : ("link" as const),
  }));

  let totalMmsBytes = resolved
    .filter((attachment) => attachment.deliveryMode === "mms")
    .reduce((sum, attachment) => sum + attachment.byteLength, 0);

  if (totalMmsBytes <= MAX_MMS_TOTAL_BYTES) {
    return resolved;
  }

  const demotableIndexes = resolved
    .map((attachment, index) => ({ attachment, index }))
    .filter(
      ({ attachment }) =>
        attachment.deliveryMode === "mms" && attachment.contentType === "application/pdf",
    )
    .map(({ index }) => index);

  for (const index of demotableIndexes) {
    const attachment = resolved[index];
    if (!attachment) {
      continue;
    }

    resolved[index] = {
      ...attachment,
      deliveryMode: "link",
    };
    totalMmsBytes = resolved
      .filter((attachment) => attachment.deliveryMode === "mms")
      .reduce((sum, attachment) => sum + attachment.byteLength, 0);

    if (totalMmsBytes <= MAX_MMS_TOTAL_BYTES) {
      return resolved;
    }
  }

  throw new Error("Selected MMS attachments exceed Twilio's 5 MB limit.");
}

export function buildLinkOnlyAttachmentText(
  attachments: Array<{ fileName?: string; url?: string }>,
): string {
  return attachments
    .filter((attachment): attachment is { fileName?: string; url: string } => Boolean(attachment.url))
    .map((attachment) => {
      const label = attachment.fileName?.trim() || "Attachment";
      return `${label}: ${attachment.url}`;
    })
    .join("\n");
}
