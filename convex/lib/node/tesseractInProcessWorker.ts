"use node";

// These are CommonJS-only internal Tesseract modules, but static imports make
// Convex include them in the Node bundle.
// @ts-expect-error no published typings for internal worker-script module
import tesseractWorkerScriptModule from "tesseract.js/src/worker-script/index.js";
// @ts-expect-error no published typings for internal worker-script module
import getCoreModule from "tesseract.js/src/worker-script/node/getCore.js";
// @ts-expect-error no published typings for internal worker-script module
import gunzipModule from "tesseract.js/src/worker-script/node/gunzip.js";
// @ts-expect-error no published typings for internal worker-script module
import cacheModule from "tesseract.js/src/worker-script/node/cache.js";

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
const getCore = getCoreModule as (
  oem: number,
  corePath: unknown,
  res: { progress: (update: { progress: number; status: string }) => void },
) => Promise<unknown>;
const gunzip = gunzipModule as (
  data: Uint8Array,
) => Uint8Array;
const cache = cacheModule as Record<string, unknown>;

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
    langs: [...args.languages],
    options: {
      cacheMethod: args.cacheMethod ?? "none",
      dataPath: undefined,
      gzip: true,
      langPath: undefined,
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
