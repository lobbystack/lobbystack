import { createServer } from "node:http";

import { tool, type ToolSet } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { initializeTelemetry, injectTraceContext, shutdownTelemetry, withCallContext, withSpan } from "@lobbystack/telemetry/node";

import { withToolSpans } from "./agent";

type Execute = (input: object, options: { toolCallId: string; messages: never[]; abortSignal?: AbortSignal }) => Promise<unknown>;

const lookup = (execute: () => Promise<unknown>): ToolSet => withToolSpans({ lookupBooking: tool({ description: "Looks up a booking.", inputSchema: z.object({}), execute }) });
const run = (tools: ToolSet, abortSignal?: AbortSignal) => (tools.lookupBooking!.execute as unknown as Execute)({}, { toolCallId: "call_1", messages: [], ...(abortSignal ? { abortSignal } : {}) });

beforeEach(() => {
  // Error reports go no further than the log.
  for (const key of ["POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "POSTHOG_API_KEY"]) vi.stubEnv(key, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("withToolSpans", () => {
  it("runs each tool call in its own span under the request's, and notes a declined outcome", async () => {
    const traces: string[] = [];
    const receiver = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += String(chunk);
      if (request.url === "/v1/traces") traces.push(body);
      response.end("{}");
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    const address = receiver.address();
    if (!address || typeof address === "string") throw new Error("OTLP test receiver did not start.");
    try {
      await initializeTelemetry({ endpoint: `http://127.0.0.1:${address.port}`, serviceName: "lobbystack-test" });
      let request: string | undefined;
      let inTool: string | undefined;
      const tools = lookup(async () => {
        inTool = injectTraceContext({}).traceparent;
        return { ok: false, reason: "Ask for the name the appointment was booked under." };
      });
      await withSpan("live.delegation", {}, async () => {
        request = injectTraceContext({}).traceparent;
        await expect(run(tools)).resolves.toMatchObject({ ok: false });
      });
      // Same trace, its own span.
      expect(inTool?.slice(0, 35)).toBe(request?.slice(0, 35));
      expect(inTool).not.toBe(request);
      await shutdownTelemetry();
      const exported = traces.join("\n");
      for (const expected of ["tool.lookupBooking", "gen_ai.tool.name", "lobbystack.tool.ok"]) expect(exported).toContain(expected);
    } finally {
      await shutdownTelemetry();
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });

  it("reports a tool that throws with the call's IDs, and passes the failure on to the model", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tools = lookup(async () => { throw new Error("Bookings table unavailable"); });

    await withCallContext({ callId: "call_42", sessionId: "rtc_42" }, async () => {
      await expect(run(tools)).rejects.toThrow("Bookings table unavailable");
    });

    expect(error.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      expect.objectContaining({ level: "error", message: "exception", operation: "tool.lookupBooking", callId: "call_42", sessionId: "rtc_42", error: "Bookings table unavailable" }),
    ]);
  });

  it("doesn't report a tool that fails because the call ended", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ended = new AbortController();
    ended.abort();

    await expect(run(lookup(async () => { throw new Error("aborted"); }), ended.signal)).rejects.toThrow("aborted");

    expect(error).not.toHaveBeenCalled();
  });
});
