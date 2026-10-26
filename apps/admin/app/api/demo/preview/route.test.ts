import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ previewProspectDemo: fixture.preview }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));

import { POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const preview = (headers: Record<string, string>) => POST(new Request("http://localhost/api/demo/preview", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ token: "token" }) }));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.preview.mockResolvedValue({ state: "invalid" });
});

it("reads a demo on the brand the proxy resolved, and on the host's brand when it resolved none", async () => {
  await preview({ "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  expect(fixture.preview).toHaveBeenLastCalledWith({ db: "app" }, "token", { kind: "partner", partnerId });
  await preview({ "x-lobbystack-brand": "host" });
  expect(fixture.preview).toHaveBeenLastCalledWith({ db: "app" }, "token", { kind: "host" });
  // A client can't name a partner's brand itself: the proxy strips any it sends, and a half-formed one reads as the host's.
  await preview({ "x-lobbystack-brand": `partner:${partnerId}` });
  expect(fixture.preview).toHaveBeenLastCalledWith({ db: "app" }, "token", { kind: "host" });
});
