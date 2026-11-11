import { describe, expect, it, vi } from "vitest";

import { applyRules, type BusinessSetupPort, type SetupChange } from "./businessSetup";

// Every new business starts with a call rule and a text rule titled in its
// language, so a setup's call rule updates that one instead of adding a second.
function run(current: Array<Record<string, unknown>>) {
  const port = { listRules: vi.fn(async () => current), createRule: vi.fn(async () => ({})), updateRule: vi.fn(async () => undefined) };
  const changes: SetupChange[] = [];
  return { port, changes, setup: { port: port as unknown as BusinessSetupPort, plan: false, log: (change: SetupChange) => { changes.push(change); } } };
}

describe("applyRules", () => {
  it("updates the business's own call rule, whatever language its title is in", async () => {
    const { port, setup } = run([{ id: "calls", title: "Pendant les appels", content: "Parlez lentement.", channel: "voice", active: true }]);
    await applyRules(setup, [{ title: "On calls", content: "Speak slowly.", channel: "voice" }]);
    expect(port.createRule).not.toHaveBeenCalled();
    expect(port.updateRule).toHaveBeenCalledWith("calls", { title: "On calls", content: "Speak slowly." });
  });

  it("adds a call rule next to one someone named themselves", async () => {
    const { port, setup } = run([{ id: "mine", title: "Phone manner", content: "Smile.", channel: "voice", active: true }]);
    await applyRules(setup, [{ title: "On calls", content: "Speak slowly.", channel: "voice" }]);
    expect(port.createRule).toHaveBeenCalledOnce();
    expect(port.updateRule).not.toHaveBeenCalled();
  });
});
