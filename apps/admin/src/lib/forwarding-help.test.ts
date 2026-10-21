import { afterEach, expect, it, vi } from "vitest";

import { forwardingHelpUrl } from "./forwarding-help";

afterEach(() => { vi.unstubAllEnvs(); });

it("opens LobbyStack's forwarding guide in the reader's language when it has one", () => {
  expect(forwardingHelpUrl("fr")).toBe("https://docs.lobbystack.com/fr/getting-started/forward-calls");
  expect(forwardingHelpUrl("es")).toBe("https://docs.lobbystack.com/es/getting-started/forward-calls");
  expect(forwardingHelpUrl("sr")).toBe("https://docs.lobbystack.com/getting-started/forward-calls");
});

it("opens the guide on the deployment's own docs, at the same path in every language", () => {
  vi.stubEnv("NEXT_PUBLIC_DOCS_SITE_URL", "https://help.example.com/");
  expect(forwardingHelpUrl("fr")).toBe("https://help.example.com/getting-started/forward-calls");
  expect(forwardingHelpUrl("en")).toBe("https://help.example.com/getting-started/forward-calls");
});
