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

  it("keeps keys the example does not list in a closing section by default", () => {
    const { output, unlisted } = syncEnv(example, "ONE=1\nOLD=mine\n", { random: () => "x" });
    expect(unlisted).toEqual(["OLD"]);
    expect(output.endsWith("\n\n# ==== NOT IN .env.example ====\nOLD=mine\n")).toBe(true);
  });

  it("removes only unlisted keys and lines with prune, keeping every value", () => {
    const current = "ONE=mine\nSECRET=old\nOLD=gone\nstray line\n";
    const { output, unlisted, stray } = syncEnv(example, current, { prune: true, random: () => "new" });
    expect(output).toBe(["# ==== A ====", "ONE=mine", "TWO=", "", "# ==== B ====", "SECRET=old", "TWILIO_AUTH_TOKEN=", ""].join("\n"));
    expect(unlisted).toEqual(["OLD"]);
    expect(stray).toEqual(["stray line"]);
  });

  it("copies comments from the example through like section headers", () => {
    const commented = "# ==== A ====\n# Setup note.\nONE=d\n";
    expect(syncEnv(commented, "ONE=mine\n", { random: () => "x" }).output).toBe("# ==== A ====\n# Setup note.\nONE=mine\n");
  });

  it("resets everything local with reset: example values, no extra keys, new secrets", () => {
    const current = "ONE=mine\nTWO=mine\nSECRET=old\nOLD=gone\nstray line\n";
    const { output, unlisted, reset, added, stray } = syncEnv(example, current, { reset: true, random: () => "new" });
    expect(output).toBe(["# ==== A ====", "ONE=default", "TWO=", "", "# ==== B ====", "SECRET=new", "TWILIO_AUTH_TOKEN=", ""].join("\n"));
    expect(reset).toEqual(["ONE", "TWO", "SECRET"]);
    expect(added).toEqual(["TWILIO_AUTH_TOKEN"]);
    expect(unlisted).toEqual(["OLD"]);
    expect(stray).toEqual(["stray line"]);
  });

  it("keeps export lines, lowercase keys and multi-line quoted values as written", () => {
    const current = ["export ONE=exported", 'cert="line1', 'line2"', "my_key=low", "ONE_MORE=x"].join("\n");
    const { output, unlisted } = syncEnv(example, current, { random: () => "x" });
    expect(output).toContain("export ONE=exported\n");
    expect(output).toContain('\n# ==== NOT IN .env.example ====\ncert="line1\nline2"\nmy_key=low\nONE_MORE=x\n');
    expect(unlisted).toEqual(["cert", "my_key", "ONE_MORE"]);
  });

  it("keeps and reports lines that are not assignments", () => {
    const { output, stray } = syncEnv(example, "ONE=1\nnot an assignment\n# note\n", { random: () => "x" });
    expect(stray).toEqual(["not an assignment"]);
    expect(output).toContain("not an assignment");
    expect(output).not.toContain("# note");
  });

  it("reuses a generated secret inside composite values", () => {
    const composite = "PW=replace-with-a-password\nURL=postgres://u:replace-with-a-password@h/db\n";
    expect(syncEnv(composite, "", { random: () => "pw" }).output).toBe("PW=pw\nURL=postgres://u:pw@h/db\n");
    expect(syncEnv(composite, "PW=mine\n", { random: () => "new" }).output).toBe("PW=mine\nURL=postgres://u:mine@h/db\n");
  });

  it("is stable when run twice and accepts CRLF input", () => {
    const first = syncEnv(example.replace(/\n/g, "\r\n"), "OLD=1\r\nONE=a\r\n", { random: () => "x" }).output;
    expect(first).not.toContain("\r");
    expect(syncEnv(example, first, { random: () => "y" }).output).toBe(first);
  });
});
