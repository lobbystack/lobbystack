import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dispatchHandlersMock,
  setAdapterMock,
} = vi.hoisted(() => ({
  dispatchHandlersMock: vi.fn(),
  setAdapterMock: vi.fn(),
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

import {
  clearCachedInProcessTesseractWorkers,
  createInProcessTesseractWorker,
  runWithCachedInProcessTesseractWorker,
} from "../../../convex/lib/node/tesseractInProcessWorker";

describe("createInProcessTesseractWorker", () => {
  beforeEach(async () => {
    await clearCachedInProcessTesseractWorkers();
    vi.clearAllMocks();
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

  it("reuses decoded bundled language bytes across worker initialization", async () => {
    await createInProcessTesseractWorker({
      cacheMethod: "none",
      languages: ["eng"],
      oem: 1,
    });
    await createInProcessTesseractWorker({
      cacheMethod: "none",
      languages: ["eng"],
      oem: 1,
    });

    const loadLanguageCalls = dispatchHandlersMock.mock.calls.filter(
      ([packet]) => packet.action === "loadLanguage",
    );
    const firstPayload = loadLanguageCalls[0]?.[0]?.payload as
      | { langs: Array<{ code: string; data: Uint8Array }> }
      | undefined;
    const secondPayload = loadLanguageCalls[1]?.[0]?.payload as
      | { langs: Array<{ code: string; data: Uint8Array }> }
      | undefined;

    expect(firstPayload?.langs[0]?.data).toBe(secondPayload?.langs[0]?.data);
  });

  it("reuses a warm cached worker for the same OCR language set", async () => {
    const seenWorkers: Array<unknown> = [];

    await runWithCachedInProcessTesseractWorker(
      {
        cacheMethod: "none",
        languages: ["eng"],
        oem: 1,
      },
      async (worker) => {
        seenWorkers.push(worker);
        return null;
      },
    );

    await runWithCachedInProcessTesseractWorker(
      {
        cacheMethod: "none",
        languages: ["eng"],
        oem: 1,
      },
      async (worker) => {
        seenWorkers.push(worker);
        return null;
      },
    );

    expect(seenWorkers[0]).toBe(seenWorkers[1]);
    expect(
      dispatchHandlersMock.mock.calls.filter(([packet]) => packet.action === "load"),
    ).toHaveLength(1);
    expect(
      dispatchHandlersMock.mock.calls.filter(([packet]) => packet.action === "initialize"),
    ).toHaveLength(1);
  });

  it("loads OCR languages from bundled local assets instead of remote paths", async () => {
    await createInProcessTesseractWorker({
      cacheMethod: "none",
      languages: ["eng", "fra"],
      oem: 1,
    });

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
    expect(payload?.langs[0]?.data.length).toBeGreaterThan(1_000_000);
    expect(payload?.langs[1]?.data.length).toBeGreaterThan(100_000);
  });

  it("rejects unsupported bundled OCR languages", async () => {
    await expect(
      createInProcessTesseractWorker({
        languages: ["spa"],
        oem: 1,
      }),
    ).rejects.toThrow("Unsupported bundled OCR language: spa");
  });

  it("rejects non-LSTM OCR mode because only bundled LSTM data is vendored", async () => {
    await expect(
      createInProcessTesseractWorker({
        languages: ["eng"],
        oem: 0,
      }),
    ).rejects.toThrow(
      "Only bundled LSTM OCR language data is supported in this runtime.",
    );
  });
});
