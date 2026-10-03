import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/telemetry/node", () => ({ redactOtelExceptionText: (value: string) => value }));

import { logUnhandledRejections } from "./processGuards";

describe("logUnhandledRejections", () => {
  it("logs a rejection nothing handled instead of letting it end the process", () => {
    const target = new EventEmitter();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logUnhandledRejections(target as unknown as NodeJS.Process);

    target.emit("unhandledRejection", new Error("Connection is closed."), Promise.resolve());

    expect(error).toHaveBeenCalledWith(JSON.stringify({ event: "worker.unhandled_rejection", message: "Connection is closed." }));
    error.mockRestore();
  });
});
