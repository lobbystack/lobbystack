import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import {
  getLogger,
  getMeter,
  initializeTelemetry,
  injectTraceContext,
  recordException,
  redactOtelAttributes,
  registerStorageHttpEndpoint,
  setSpanAttributes,
  shutdownTelemetry,
  withExtractedTraceContext,
  withSpan,
} from "@lobbystack/telemetry/node";

type CapturedRequest = {
  authorization?: string;
  body: Buffer;
  path: string;
};

const configuredEndpoint = process.env.OTEL_CERTIFICATION_ENDPOINT;
const authorization = "Bearer telemetry-certification";
const marker = process.env.TELEMETRY_CERTIFICATION_MARKER ?? `telemetry-${randomUUID()}`;
const email = `${marker}@example.invalid`;
const phone = "+14165550000";
const bearer = `Bearer ${marker}`;
const secretKey = `sk-${marker}`;
const storageMarker = `private-file-${randomUUID()}.pdf`;
const storageCredential = `credential-${randomUUID()}`;
const storageSignature = `signature-${randomUUID()}`;
const autoHttpMarker = `auto-http-${randomUUID()}`;

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function emitDestination(traceparent: string): Promise<void> {
  if (!configuredEndpoint) throw new Error("Telemetry certification endpoint is required.");
  process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=${authorization}`;
  await initializeTelemetry({ serviceName: "lobbystack-telemetry-destination", endpoint: configuredEndpoint });
  await withExtractedTraceContext({ traceparent }, async () => {
    await withSpan("telemetry.certification.destination", {}, async (span) => {
      setSpanAttributes(span, {
        "certification.correlation_id": marker,
        "customer.email": email,
        "customer.phone": phone,
        "lobbystack.prompt": marker,
      });
      getMeter("telemetry-certification").createCounter("telemetry.certification.count").add(1, redactOtelAttributes({
        "certification.correlation_id": marker,
        "customer.email": email,
      }));
      getLogger("telemetry-certification").emit({
        body: "telemetry certification destination",
        attributes: {
          "certification.correlation_id": marker,
          "customer.email": email,
          "customer.phone": phone,
        },
      });
    });
  });
  await shutdownTelemetry();
}

async function emitOutage(): Promise<void> {
  if (!configuredEndpoint) throw new Error("Telemetry certification endpoint is required.");
  process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=${authorization}`;
  await initializeTelemetry({ serviceName: "lobbystack-telemetry-outage", endpoint: configuredEndpoint });
  await withSpan("telemetry.certification.exporter-outage", {}, async () => undefined);
  const outageStartedAt = Date.now();
  await shutdownTelemetry();
  if (Date.now() - outageStartedAt > 6_000) throw new Error("Telemetry exporter outage blocked shutdown.");
}

async function runChild(root: string, traceparent: string, endpoint: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "scripts/replacement-telemetry-check.ts", "--destination", traceparent],
      {
        cwd: root,
        env: {
          ...process.env,
          OTEL_CERTIFICATION_ENDPOINT: endpoint,
          OTEL_EXPORTER_OTLP_HEADERS: `Authorization=${authorization}`,
          OTEL_SERVICE_NAME: "lobbystack-telemetry-destination",
          TELEMETRY_CERTIFICATION_MARKER: marker,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(output || `Telemetry destination exited with ${code}.`)));
  });
}

async function runOutageChild(root: string, endpoint: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "scripts/replacement-telemetry-check.ts", "--outage"],
      {
        cwd: root,
        env: {
          ...process.env,
          OTEL_CERTIFICATION_ENDPOINT: endpoint,
          OTEL_EXPORTER_OTLP_HEADERS: `Authorization=${authorization}`,
          OTEL_SERVICE_NAME: "lobbystack-telemetry-outage",
          TELEMETRY_CERTIFICATION_MARKER: marker,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Telemetry exporter outage kept the certification process alive for more than 10 seconds."));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(output || `Telemetry outage probe exited with ${code}.`));
    });
  });
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function traceIdsFromRequest(body: Buffer): string[] {
  if (body[0] === 0x7b) {
    const ids: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (key === "traceId" && typeof item === "string") {
          ids.push(/^[a-f0-9]{32}$/i.test(item) ? item.toLowerCase() : Buffer.from(item, "base64").toString("hex"));
        } else {
          visit(item);
        }
      }
    };
    visit(JSON.parse(body.toString("utf8")) as unknown);
    return ids;
  }

  const ids: string[] = [];
  for (let index = 0; index < body.length - 18; index += 1) {
    if (body[index] === 0x0a && body[index + 1] === 0x10) {
      ids.push(body.subarray(index + 2, index + 18).toString("hex"));
    }
  }
  return ids;
}

async function runCertification(): Promise<void> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const requests: CapturedRequest[] = [];
  const receiver = createServer(async (request, response) => {
    try {
      const encodedBody = await readRequestBody(request);
      requests.push({
        authorization: Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization,
        body: request.headers["content-encoding"] === "gzip" ? gunzipSync(encodedBody) : encodedBody,
        path: request.url ?? "",
      });
      response.writeHead(200, { "content-type": "application/x-protobuf" });
      response.end();
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  const storageServer = createTcpServer((socket) => socket.end("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n"));

  try {
    await new Promise<void>((resolve, reject) => { receiver.once("error", reject); receiver.listen(0, "127.0.0.1", resolve); });
    const receiverAddress = receiver.address();
    if (!receiverAddress || typeof receiverAddress === "string") throw new Error("OTLP test receiver did not start.");
    const endpoint = `http://127.0.0.1:${receiverAddress.port}`;

    await new Promise<void>((resolve, reject) => { storageServer.once("error", reject); storageServer.listen(0, "127.0.0.1", resolve); });
    const storageAddress = storageServer.address();
    if (!storageAddress || typeof storageAddress === "string") throw new Error("Storage telemetry test server did not start.");
    const storageOrigin = `http://127.0.0.1:${storageAddress.port}`;
    registerStorageHttpEndpoint(storageOrigin);

    process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=${authorization}`;
    await initializeTelemetry({ serviceName: "lobbystack-telemetry-source", endpoint });
    let traceId = "";
    await withSpan("telemetry.certification.source", {}, async (span) => {
      traceId = span.spanContext().traceId;
      setSpanAttributes(span, {
        "certification.correlation_id": marker,
        "customer.email": email,
        "customer.phone": phone,
        "db.statement": `select '${email}'`,
        "http.request.body": marker,
        "lobbystack.transcript": marker,
        "storage.object_key": `business/uploads/${storageMarker}`,
        "storage.file_name": storageMarker,
        "storage.operation": "create_upload",
      });
      const signedStorageUrl = `${storageOrigin}/business/uploads/${storageMarker}?X-Amz-Credential=${storageCredential}&X-Amz-Signature=${storageSignature}`;
      recordException(new Error(`contact ${email} at ${phone} using ${bearer} ${secretKey}; upload ${signedStorageUrl}`), {}, span);
      const storageResponse = await fetch(signedStorageUrl);
      if (!storageResponse.ok) throw new Error("Storage telemetry suppression request failed.");
      const instrumentedResponse = await fetch(`${endpoint}/telemetry-auto-http-certification?token=${autoHttpMarker}`);
      if (!instrumentedResponse.ok) throw new Error("Automatic HTTP telemetry request failed.");

      const ragMeter = getMeter("lobbystack-rag-certification");
      for (const metric of [
        "rag.extraction.duration_ms",
        "rag.ocr.duration_ms",
        "rag.chunk.count",
        "rag.embedding.duration_ms",
        "rag.index.duration_ms",
        "rag.search.duration_ms",
        "rag.search.result_count",
        "rag.snapshot_refresh.duration_ms",
      ]) ragMeter.createHistogram(metric).record(1, { operation: "certification" });
      ragMeter.createCounter("rag.embedding.failures").add(1, { operation: "certification" });

      const traceparent = injectTraceContext({}).traceparent;
      if (!traceparent) throw new Error("Telemetry source did not inject trace context.");
      await runChild(root, traceparent, endpoint);
    });
    await shutdownTelemetry();

    for (const path of ["/v1/traces", "/v1/metrics", "/v1/logs"]) {
      if (!requests.some((request) => request.path === path)) throw new Error(`Direct OTLP export is missing ${path}.`);
    }
    if (requests.some((request) => request.path.startsWith("/v1/") && request.authorization !== authorization)) {
      throw new Error("Direct OTLP export did not forward the configured authorization header.");
    }

    const output = Buffer.concat(requests.map((request) => request.body));
    const outputText = output.toString("utf8");
    for (const expected of [
      "telemetry.certification.source",
      "telemetry.certification.destination",
      "telemetry.certification.count",
      "telemetry certification destination",
      "lobbystack-telemetry-source",
      "lobbystack-telemetry-destination",
      "rag.extraction.duration_ms",
      "rag.embedding.failures",
      "storage.operation",
      "url.full",
    ]) {
      if (!outputText.includes(expected)) throw new Error(`Direct OTLP payload is missing ${expected}.`);
    }
    const correlatedTraceRequests = requests.filter((request) => request.path === "/v1/traces" && traceIdsFromRequest(request.body).includes(traceId));
    if (correlatedTraceRequests.length < 2) {
      const traceRequests = requests.filter((request) => request.path === "/v1/traces");
      const exportedTraceIds = traceRequests.flatMap((request) => traceIdsFromRequest(request.body));
      throw new Error(`Source and destination spans do not share the same trace ID (source ${traceId}; exported ${[...new Set(exportedTraceIds)].join(", ") || "none"}).`);
    }
    for (const forbidden of [email, phone, bearer, secretKey, storageMarker, storageCredential, storageSignature, autoHttpMarker]) {
      if (outputText.includes(forbidden)) throw new Error(`Direct OTLP payload leaked sensitive marker: ${forbidden}`);
    }

    await closeServer(receiver);
    await runOutageChild(root, endpoint);

    console.log("telemetry-trace-correlation: ok");
    console.log("telemetry-traces-metrics-logs: ok");
    console.log("telemetry-redaction: ok");
    console.log("telemetry-storage-url-redaction: ok");
    console.log("telemetry-exporter-headers: ok");
    console.log("telemetry-exporter-outage: ok");
    console.log("telemetry-receiver-shutdown: ok");
  } finally {
    await shutdownTelemetry();
    if (receiver.listening) await closeServer(receiver);
    if (storageServer.listening) storageServer.close();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--outage")) {
    await emitOutage();
    return;
  }
  const destinationIndex = process.argv.indexOf("--destination");
  if (destinationIndex >= 0) {
    const traceparent = process.argv[destinationIndex + 1];
    if (!traceparent) throw new Error("Destination trace context is required.");
    await emitDestination(traceparent);
    return;
  }
  await runCertification();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
