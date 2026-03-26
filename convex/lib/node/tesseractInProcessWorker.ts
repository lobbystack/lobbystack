"use node";

// These are CommonJS-only internal Tesseract modules, but static imports make
// Convex include them in the Node bundle.
// @ts-expect-error no published typings for internal worker-script module
import tesseractWorkerScriptModule from "tesseract.js/src/worker-script/index.js";
// @ts-expect-error no published typings for internal worker-script module
import gunzipModule from "tesseract.js/src/worker-script/node/gunzip.js";
// @ts-expect-error no published typings for internal worker-script module
import cacheModule from "tesseract.js/src/worker-script/node/cache.js";
// Vendored from tesseract.js-core so Convex can load a single JS bundle with
// the wasm embedded instead of looking for a separate .wasm file at runtime.
// @ts-ignore generated vendored file has no declaration
import tesseractCoreLstmModule from "./tesseract-core-lstm.wasm.js";
import { TESSDATA_ENG_GZ_BASE64 } from "./tessdataEng";
import { TESSDATA_FRA_GZ_BASE64 } from "./tessdataFra";

const tesseractWorkerScript = tesseractWorkerScriptModule as {
  dispatchHandlers: (
    packet: {
      action: string;
      jobId: string;
      payload: Record<string, unknown>;
      workerId: string;
    },
    send: (message: {
      action: string;
      data: unknown;
      jobId: string;
      status: "progress" | "reject" | "resolve";
      workerId: string;
    }) => void,
  ) => void;
  setAdapter: (adapter: Record<string, unknown>) => void;
};
const tesseractCoreLstm = tesseractCoreLstmModule as (
  moduleArgs?: Record<string, unknown>,
) => Promise<unknown>;
const getCore = (async (
  oem: number,
  corePath: unknown,
  res: { progress: (update: { progress: number; status: string }) => void },
) => {
  void oem;
  void corePath;
  res.progress({ progress: 0, status: "loading tesseract core" });
  res.progress({ progress: 1, status: "loading tesseract core" });
  return tesseractCoreLstm;
}) as (
  oem: number,
  corePath: unknown,
  res: { progress: (update: { progress: number; status: string }) => void },
) => Promise<unknown>;
const gunzip = gunzipModule as (
  data: Uint8Array,
) => Uint8Array;
const cache = cacheModule as Record<string, unknown>;
const TESSERACT_LANGUAGE_DATA = {
  eng: TESSDATA_ENG_GZ_BASE64,
  fra: TESSDATA_FRA_GZ_BASE64,
} as const;

type InProcessJobResult<T> = {
  data: T;
  jobId: string;
};

type InProcessWorker = {
  recognize: (
    image: Buffer,
  ) => Promise<
    InProcessJobResult<{
      text: string;
    }>
  >;
  setParameters: (params: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
};

type CreateInProcessTesseractWorkerArgs = {
  cacheMethod?: "none" | "readOnly" | "refresh" | "write";
  languages: ReadonlyArray<string>;
  logger?: (progress: unknown) => void;
  oem: number;
};

const decodedLanguageDataCache = new Map<string, Uint8Array>();
const cachedWorkerEntries = new Map<
  string,
  {
    release: Promise<void>;
    workerPromise: Promise<InProcessWorker>;
  }
>();

async function loadBundledLanguageData(args: {
  languages: ReadonlyArray<string>;
  lstmOnly: boolean;
}) {
  return await Promise.all(
    args.languages.map(async (language) => {
      const trainedDataBase64 =
        TESSERACT_LANGUAGE_DATA[
          language as keyof typeof TESSERACT_LANGUAGE_DATA
        ];
      if (!trainedDataBase64) {
        throw new Error(`Unsupported bundled OCR language: ${language}`);
      }
      if (!args.lstmOnly) {
        throw new Error(
          "Only bundled LSTM OCR language data is supported in this runtime.",
        );
      }
      let data = decodedLanguageDataCache.get(language);
      if (!data) {
        data = new Uint8Array(Buffer.from(trainedDataBase64, "base64"));
        decodedLanguageDataCache.set(language, data);
      }

      return {
        code: language,
        data,
      };
    }),
  );
}

function createJobRunner(args: {
  logger: ((progress: unknown) => void) | undefined;
  workerId: string;
}) {
  let jobCounter = 0;

  return async function runJob<T>(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<InProcessJobResult<T>> {
    const jobId = `Job-${jobCounter}`;
    jobCounter += 1;

    return await new Promise<InProcessJobResult<T>>((resolve, reject) => {
      tesseractWorkerScript.dispatchHandlers(
        {
          action,
          jobId,
          payload,
          workerId: args.workerId,
        },
        (message) => {
          if (message.status === "progress") {
            args.logger?.(message.data);
            return;
          }

          if (message.status === "reject") {
            reject(message.data);
            return;
          }

          resolve({
            data: message.data as T,
            jobId: message.jobId,
          });
        },
      );
    });
  };
}

export async function createInProcessTesseractWorker(
  args: CreateInProcessTesseractWorkerArgs,
): Promise<InProcessWorker> {
  const workerId = `InProcessWorker-${Date.now()}`;
  const runJob = createJobRunner({
    logger: args.logger,
    workerId,
  });
  const lstmOnly = args.oem === 1 || args.oem === 3;
  const bundledLanguages = await loadBundledLanguageData({
    languages: args.languages,
    lstmOnly,
  });

  tesseractWorkerScript.setAdapter({
    getCore,
    gunzip,
    fetch: global.fetch.bind(globalThis),
    ...cache,
  });

  await runJob("load", {
    options: {
      corePath: undefined,
      logging: false,
      lstmOnly,
    },
  });
  await runJob("loadLanguage", {
    langs: bundledLanguages,
    options: {
      cacheMethod: args.cacheMethod ?? "none",
      dataPath: undefined,
      gzip: true,
      langPath: null,
      lstmOnly,
    },
  });
  await runJob("initialize", {
    config: {},
    langs: [...args.languages],
    oem: args.oem,
  });

  return {
    async setParameters(params) {
      await runJob("setParameters", { params });
    },
    async recognize(image) {
      return await runJob<{ text: string }>("recognize", {
        image: new Uint8Array(image),
        options: {},
        output: { text: true },
      });
    },
    async terminate() {
      await runJob("terminate", {});
    },
  };
}

function getCachedWorkerKey(args: CreateInProcessTesseractWorkerArgs): string {
  return `${args.oem}:${[...args.languages].join("+")}`;
}

export async function runWithCachedInProcessTesseractWorker<T>(
  args: CreateInProcessTesseractWorkerArgs,
  callback: (worker: InProcessWorker) => Promise<T>,
): Promise<T> {
  const key = getCachedWorkerKey(args);
  let entry = cachedWorkerEntries.get(key);

  if (!entry) {
    entry = {
      release: Promise.resolve(),
      workerPromise: createInProcessTesseractWorker(args),
    };
    cachedWorkerEntries.set(key, entry);
  }

  const waitForTurn = entry.release.catch(() => undefined);
  let releaseCurrentTurn!: () => void;
  entry.release = new Promise<void>((resolve) => {
    releaseCurrentTurn = resolve;
  });

  try {
    await waitForTurn;
    const worker = await entry.workerPromise;
    return await callback(worker);
  } catch (error) {
    cachedWorkerEntries.delete(key);
    try {
      const worker = await entry.workerPromise;
      await worker.terminate();
    } catch {
      // Ignore cleanup failures while tearing down a broken cached worker.
    }
    throw error;
  } finally {
    releaseCurrentTurn();
  }
}

export async function clearCachedInProcessTesseractWorkers(): Promise<void> {
  const workers = [...cachedWorkerEntries.values()];
  cachedWorkerEntries.clear();

  await Promise.all(
    workers.map(async (entry) => {
      try {
        const worker = await entry.workerPromise;
        await worker.terminate();
      } catch {
        // Ignore best-effort cleanup errors in tests.
      }
    }),
  );
}
