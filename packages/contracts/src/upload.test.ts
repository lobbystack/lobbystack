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

  it("accepts any UUID Postgres stores, not only RFC 9562 ones", () => {
    expect(uploadCreateRequestSchema.safeParse({ ...base, businessId: "11111111-1111-1111-1111-111111111111", purpose: "export", contentType: "text/csv" }).success).toBe(true);
    expect(uploadCreateRequestSchema.safeParse({ ...base, businessId: "not-a-uuid", purpose: "export", contentType: "text/csv" }).success).toBe(false);
  });
});
