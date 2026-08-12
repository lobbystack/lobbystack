import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

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
  withSpan,
  withExtractedTraceContext,
} from "@lobbystack/telemetry/node";

const endpoint = process.env.OTEL_CERTIFICATION_ENDPOINT ?? "http://127.0.0.1:14318";
const marker = process.env.TELEMETRY_CERTIFICATION_MARKER ?? `telemetry-${randomUUID()}`;
const email = `${marker}@example.invalid`;
const phone = "+14165550000";
const bearer = `Bearer ${marker}`;
const secretKey = `sk-${marker}`;
const storageMarker = `private-file-${randomUUID()}.pdf`;
const storageCredential = `credential-${randomUUID()}`;
const storageSignature = `signature-${randomUUID()}`;

async function emitDestination(traceparent: string): Promise<void> {
  process.env.OTEL_SERVICE_NAME = "lobbystack-telemetry-destination";
  await initializeTelemetry({ serviceName: "lobbystack-telemetry-destination", endpoint });
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
        attributes: redactOtelAttributes({
          "certification.correlation_id": marker,
          "customer.email": email,
          "customer.phone": phone,
        }),
      });
    });
  });
  await shutdownTelemetry();
}

async function runCertification(): Promise<void> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const composeArgs = [
    "compose",
    "--project-name",
    process.env.TELEMETRY_CERTIFICATION_PROJECT ?? "lobbystack-telemetry-certification",
    "--env-file",
    `${root}.env.replacement.example`,
    "-f",
    `${root}docker-compose.replacement.yml`,
    "--profile",
    "certification",
  ];
  const compose = (args: string[], allowFailure = false): string => {
    const result = spawnSync("docker", [...composeArgs, ...args], { cwd: root, encoding: "utf8" });
    if (!allowFailure && result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `docker compose ${args.join(" ")} failed`);
    }
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  };

  compose(["up", "-d", "--build", "otel-certifier"]);
  const storageServer = createServer((socket) => socket.end("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n"));
  try {
    await new Promise<void>((resolve, reject) => { storageServer.once("error", reject); storageServer.listen(0, "127.0.0.1", resolve); });
    const address = storageServer.address();
    if (!address || typeof address === "string") throw new Error("Storage telemetry test server did not start.");
    const storageOrigin = `http://127.0.0.1:${address.port}`;
    registerStorageHttpEndpoint(storageOrigin);
    await new Promise((resolve) => setTimeout(resolve, 500));
    process.env.OTEL_SERVICE_NAME = "lobbystack-telemetry-source";
    await initializeTelemetry({ serviceName: "lobbystack-telemetry-source", endpoint });
    let traceId = "";
    await withSpan("telemetry.certification.source", {}, async (span) => {
      traceId = span.spanContext().traceId;
      setSpanAttributes(span, {
        "certification.correlation_id": marker,
        "customer.email": email,
        "customer.phone": phone,
        "lobbystack.transcript": marker,
        "storage.object_key": `business/uploads/${storageMarker}`,
        "storage.file_name": storageMarker,
        "storage.operation": "create_upload",
      });
      const signedStorageUrl = `${storageOrigin}/business/uploads/${storageMarker}?X-Amz-Credential=${storageCredential}&X-Amz-Signature=${storageSignature}`;
      recordException(new Error(`contact ${email} at ${phone} using ${bearer} ${secretKey}; upload ${signedStorageUrl}`), {}, span);
      const storageResponse = await fetch(signedStorageUrl);
      if (!storageResponse.ok) throw new Error("Storage telemetry suppression request failed.");
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
      const child = spawnSync(
        "pnpm",
        ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "scripts/replacement-telemetry-check.ts", "--destination", traceparent],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            OTEL_CERTIFICATION_ENDPOINT: endpoint,
            OTEL_SERVICE_NAME: "lobbystack-telemetry-destination",
            TELEMETRY_CERTIFICATION_MARKER: marker,
          },
        },
      );
      if (child.status !== 0) throw new Error(child.stderr || child.stdout || "Telemetry destination failed.");
    });
    await shutdownTelemetry();

    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const output = compose(["logs", "--no-color", "otel-certifier"]);
    for (const expected of [
      "telemetry.certification.source",
      "telemetry.certification.destination",
      "telemetry.certification.count",
      "telemetry certification destination",
      "lobbystack-telemetry-source",
      "lobbystack-telemetry-destination",
      "rag.extraction.duration_ms",
      "rag.ocr.duration_ms",
      "rag.chunk.count",
      "rag.embedding.duration_ms",
      "rag.embedding.failures",
      "rag.index.duration_ms",
      "rag.search.duration_ms",
      "rag.search.result_count",
      "rag.snapshot_refresh.duration_ms",
      "storage.operation",
    ]) {
      if (!output.includes(expected)) throw new Error(`Collector output is missing ${expected}.`);
    }
    if (output.split(traceId).length - 1 < 2) {
      throw new Error("Source and destination spans do not share the same trace ID.");
    }
    for (const forbidden of [email, phone, bearer, secretKey, storageMarker, storageCredential, storageSignature]) {
      if (output.includes(forbidden)) throw new Error(`Collector output leaked sensitive marker: ${forbidden}`);
    }
    if (output.includes(`lobbystack.prompt: Str(${marker})`) || output.includes(`lobbystack.transcript: Str(${marker})`)) {
      throw new Error("Collector output leaked prompt or transcript content.");
    }

    compose(["stop", "otel-certifier"]);
    process.env.OTEL_SERVICE_NAME = "lobbystack-telemetry-outage";
    await initializeTelemetry({ serviceName: "lobbystack-telemetry-outage", endpoint });
    await withSpan("telemetry.certification.exporter-outage", {}, async () => undefined);
    await shutdownTelemetry();
    compose(["start", "otel-certifier"]);
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    console.log("telemetry-trace-correlation: ok");
    console.log("telemetry-traces-metrics-logs: ok");
    console.log("telemetry-redaction: ok");
    console.log("telemetry-storage-url-redaction: ok");
    console.log("telemetry-exporter-outage: ok");
    console.log("telemetry-collector-restart: ok");
  } finally {
    await shutdownTelemetry();
    storageServer.close();
    compose(["down", "--volumes"], true);
  }
}

async function main(): Promise<void> {
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
