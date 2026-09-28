import { expect, it } from "vitest";
import { TranslationNetworkError, isTranslationNetworkError } from "./translation-network-error";

const networkError = () => new TranslationNetworkError("/locales/en/affiliate.json", { cause: new TypeError("Load failed") });

it("recognizes network failures, alone or grouped", () => {
  expect(isTranslationNetworkError(networkError())).toBe(true);
  expect(isTranslationNetworkError(new AggregateError([networkError(), networkError()]))).toBe(true);
});

it("does not hide HTTP or parsing failures", () => {
  expect(isTranslationNetworkError(new TypeError("Load failed"))).toBe(false);
  expect(isTranslationNetworkError(new Error("Unable to load the en/affiliate translations (HTTP 503)."))).toBe(false);
  expect(isTranslationNetworkError(new AggregateError([networkError(), new Error("HTTP 503")]))).toBe(false);
  expect(isTranslationNetworkError(new AggregateError([]))).toBe(false);
});
