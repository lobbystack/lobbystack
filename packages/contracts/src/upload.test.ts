import { describe, expect, it } from "vitest";

import { uploadCreateRequestSchema } from "./index";

const base = { businessId: "00000000-0000-4000-8000-000000000001", fileName: "document.pdf", length: 100 };

describe("upload content policy", () => {
  it("accepts checksummed knowledge documents", () => {
    expect(uploadCreateRequestSchema.safeParse({ ...base, purpose: "knowledge", contentType: "application/pdf", checksum: "checksum" }).success).toBe(true);
  });

  it("rejects active content and missing knowledge checksums", () => {
    expect(uploadCreateRequestSchema.safeParse({ ...base, purpose: "knowledge", contentType: "text/html", checksum: "checksum" }).success).toBe(false);
    expect(uploadCreateRequestSchema.safeParse({ ...base, purpose: "knowledge", contentType: "application/pdf" }).success).toBe(false);
  });
});
