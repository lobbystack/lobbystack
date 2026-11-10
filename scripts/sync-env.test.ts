import { describe, expect, it } from "vitest";

import { syncEnv } from "./sync-env.mjs";

const example = ["# ==== A ====", "ONE=default", "TWO=", "", "# ==== B ====", "SECRET=replace-with-a-secret", "TWILIO_AUTH_TOKEN=replace-with-token", ""].join("\n");

describe("syncEnv", () => {
  it("follows the example's order and layout and keeps existing values", () => {
    const { output, added } = syncEnv(example, ["TWO=mine", "ONE=changed", "SECRET=keep", "TWILIO_AUTH_TOKEN=tok"].join("\n"), { random: () => "x" });
    expect(output).toBe(["# ==== A ====", "ONE=changed", "TWO=mine", "", "# ==== B ====", "SECRET=keep", "TWILIO_AUTH_TOKEN=tok", ""].join("\n"));
    expect(added).toEqual([]);
  });

  it("adds missing keys, generating placeholder secrets and blanking provider credentials", () => {
    const { output, added, generated } = syncEnv(example, "ONE=mine", { random: () => "s3" });
    expect(output).toBe(["# ==== A ====", "ONE=mine", "TWO=", "", "# ==== B ====", "SECRET=s3", "TWILIO_AUTH_TOKEN=", ""].join("\n"));
    expect(added).toEqual(["TWO", "SECRET", "TWILIO_AUTH_TOKEN"]);
    expect(generated).toEqual(["SECRET"]);
  });

  it("removes keys the example does not list, or keeps them in a closing section on request", () => {
    const current = "ONE=1\nOLD=gone\n";
    const removed = syncEnv(example, current, { random: () => "x" });
    expect(removed.unlisted).toEqual(["OLD"]);
    expect(removed.output).not.toContain("OLD");
    const kept = syncEnv(example, current, { keepUnlisted: true, random: () => "x" });
    expect(kept.output.endsWith("\n\n# ==== NOT IN .env.example ====\nOLD=gone\n")).toBe(true);
  });

  it("is stable when run twice and accepts CRLF input", () => {
    const first = syncEnv(example.replace(/\n/g, "\r\n"), "OLD=1\r\nONE=a\r\n", { random: () => "x" }).output;
    expect(first).not.toContain("\r");
    expect(syncEnv(example, first, { random: () => "y" }).output).toBe(first);
  });
});
