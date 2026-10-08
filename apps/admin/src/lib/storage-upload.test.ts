import { afterEach, describe, expect, it, vi } from "vitest";

const captureBrowserError = vi.hoisted(() => vi.fn());
vi.mock("./browser-error-reporting", () => ({ captureBrowserError }));

import { uploadToStorage } from "./storage-upload";

const upload = { url: "https://bucket.storage.example/business/knowledge/file.pdf?X-Amz-Signature=secret", headers: { "content-type": "application/pdf" } };
const file = new File(["%PDF"], "file.pdf", { type: "application/pdf" });

afterEach(() => { vi.unstubAllGlobals(); captureBrowserError.mockReset(); });

describe("uploadToStorage", () => {
  it("reports a blocked request and shows the operator the translated message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(uploadToStorage(upload, file, "We couldn't upload that document.")).rejects.toThrow("We couldn't upload that document.");
    expect(captureBrowserError).toHaveBeenCalledWith(expect.objectContaining({ message: "Storage upload to bucket.storage.example failed without a response: Failed to fetch" }));
  });

  it("reports a rejected upload with its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));

    await expect(uploadToStorage(upload, file, "Upload failed.")).rejects.toThrow("Upload failed.");
    expect(captureBrowserError).toHaveBeenCalledWith(expect.objectContaining({ message: "Storage upload to bucket.storage.example failed with HTTP 403." }));
  });

  it("sends the file with the presigned headers and reports nothing on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadToStorage(upload, file, "Upload failed.");

    expect(fetchMock).toHaveBeenCalledWith(upload.url, { method: "PUT", headers: upload.headers, body: file });
    expect(captureBrowserError).not.toHaveBeenCalled();
  });
});
