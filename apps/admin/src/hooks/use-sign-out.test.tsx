// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "fr", resolvedLanguage: "fr" } }) }));

import { useSignOut } from "./use-sign-out";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each([
  ["a failed response", async () => new Response(null, { status: 500 })],
  ["a network error", async () => { throw new TypeError("offline"); }],
])("still returns to the localized login page after %s", async (_label, fetchImpl) => {
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  const { result } = renderHook(() => useSignOut());
  await result.current();
  expect(router.replace).toHaveBeenCalledWith("/fr/login");
  expect(router.refresh).toHaveBeenCalledOnce();
});
