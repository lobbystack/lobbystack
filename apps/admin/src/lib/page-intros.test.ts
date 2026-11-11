import { beforeEach, expect, it, vi } from "vitest";

const listSeenPageIntros = vi.hoisted(() => vi.fn(async (): Promise<string[]> => ["inbox"]));
vi.mock("@lobbystack/domain", () => ({ listSeenPageIntros }));

import type { DomainContext } from "@lobbystack/domain";
import { PAGE_INTROS_E2E_COOKIE } from "@lobbystack/shared";
import { loadSeenPageIntros } from "./page-intros";

const domain = {} as DomainContext;
const cookies = (value?: string) => ({ get: (name: string) => (name === PAGE_INTROS_E2E_COOKIE && value ? { value } : undefined) });

beforeEach(() => listSeenPageIntros.mockClear());

it("reads the person's closed cards", async () => {
  expect(await loadSeenPageIntros(domain, "user", cookies(), {})).toEqual(["inbox"]);
  expect(listSeenPageIntros).toHaveBeenCalledWith(domain, "user");
});

it("shows no card when the list can't be read", async () => {
  listSeenPageIntros.mockRejectedValueOnce(new Error("database down"));
  expect(await loadSeenPageIntros(domain, "user", cookies(), {})).toBeNull();
});

it("keeps the cards away on the end-to-end server unless the browser opts in", async () => {
  expect(await loadSeenPageIntros(domain, "user", cookies(), { PAGE_INTROS_E2E_OPT_IN: "true" })).toBeNull();
  expect(listSeenPageIntros).not.toHaveBeenCalled();
  expect(await loadSeenPageIntros(domain, "user", cookies("on"), { PAGE_INTROS_E2E_OPT_IN: "true" })).toEqual(["inbox"]);
});
