import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dispatchHandlersMock,
  setAdapterMock,
  readFileMock,
  requireResolveMock,
} = vi.hoisted(() => ({
  dispatchHandlersMock: vi.fn(),
  setAdapterMock: vi.fn(),
  readFileMock: vi.fn(),
  requireResolveMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
}));

vi.mock("node:module", () => ({
  createRequire: () => ({
    resolve: requireResolveMock,
  }),
}));

vi.mock("tesseract.js/src/worker-script/index.js", () => ({
  default: {
    dispatchHandlers: dispatchHandlersMock,
    setAdapter: setAdapterMock,
  },
}));

vi.mock("tesseract.js/src/worker-script/node/gunzip.js", () => ({
  default: vi.fn((data: Uint8Array) => data),
}));

vi.mock("tesseract.js/src/worker-script/node/cache.js", () => ({
  default: {},
}));

vi.mock("../../../convex/lib/node/tesseract-core-lstm.wasm.js", () => ({
  default: vi.fn(async () => ({})),
}));

import { createInProcessTesseractWorker } from "../../../convex/lib/node/tesseractInProcessWorker";

describe("createInProcessTesseractWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireResolveMock.mockImplementation((packageName: string) => {
      return `/repo/node_modules/${packageName}/index.js`;
    });
    readFileMock.mockImplementation(async (filePath: string) => {
      return Buffer.from(`file:${filePath}`);
    });
    dispatchHandlersMock.mockImplementation((packet, send) => {
      send({
        action: packet.action,
        data: {},
        jobId: packet.jobId,
        status: "resolve",
        workerId: packet.workerId,
      });
    });
  });

  it("loads OCR languages from bundled local assets instead of remote paths", async () => {
    await createInProcessTesseractWorker({
      cacheMethod: "none",
      languages: ["eng", "fra"],
      oem: 1,
    });

    expect(readFileMock).toHaveBeenCalledWith(
      "/repo/node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    );
    expect(readFileMock).toHaveBeenCalledWith(
      "/repo/node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz",
    );

    const loadLanguageCall = dispatchHandlersMock.mock.calls.find(
      ([packet]) => packet.action === "loadLanguage",
    );
    const payload = loadLanguageCall?.[0]?.payload as
      | {
          langs: Array<{ code: string; data: Uint8Array }>;
          options: { langPath: unknown };
        }
      | undefined;

    expect(payload).toBeDefined();
    expect(payload?.options.langPath).toBeNull();
    expect(payload?.langs).toHaveLength(2);
    expect(payload?.langs[0]).toMatchObject({ code: "eng" });
    expect(payload?.langs[1]).toMatchObject({ code: "fra" });
    expect(payload?.langs[0]?.data).toBeInstanceOf(Uint8Array);
    expect(payload?.langs[1]?.data).toBeInstanceOf(Uint8Array);
  });

  it("rejects unsupported bundled OCR languages", async () => {
    await expect(
      createInProcessTesseractWorker({
        languages: ["spa"],
        oem: 1,
      }),
    ).rejects.toThrow("Unsupported bundled OCR language: spa");
  });
});
