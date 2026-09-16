import { expect, it } from "vitest";

import {
  LOCALE_HEADER,
  LOCALE_SOURCE_HEADER,
  localeFromAcceptLanguage,
  localeFromCookieHeader,
  localeFromRequestHeaders,
  negotiateLocale,
} from "./locale-request";

it("prefers an explicit ?lng= over the cookie and the browser hint", () => {
  expect(negotiateLocale({ query: "fr", cookie: "en", acceptLanguage: "en-US,en;q=0.9" })).toEqual({ locale: "fr", source: "query" });
  expect(negotiateLocale({ query: "de", cookie: "fr", acceptLanguage: "en" })).toEqual({ locale: "fr", source: "cookie" });
});

it("falls back to the cookie before the browser hint", () => {
  expect(negotiateLocale({ cookie: "fr", acceptLanguage: "en-US,en;q=0.9" })).toEqual({ locale: "fr", source: "cookie" });
  expect(negotiateLocale({ acceptLanguage: "fr-CA,fr;q=0.9" })).toEqual({ locale: "fr", source: "header" });
  expect(negotiateLocale({})).toEqual({ locale: "en", source: "default" });
  expect(negotiateLocale({ query: "es", cookie: "de", acceptLanguage: "it" })).toEqual({ locale: "en", source: "default" });
});

it("picks the highest quality supported language from Accept-Language", () => {
  expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en-US;q=0.4")).toBe("fr");
  expect(localeFromAcceptLanguage("en-US;q=0.3,fr;q=0.9")).toBe("fr");
  expect(localeFromAcceptLanguage("de;q=1.0,fr;q=0.2")).toBe("fr");
  expect(localeFromAcceptLanguage("de,ja;q=0.8")).toBeNull();
  expect(localeFromAcceptLanguage("fr;q=0")).toBeNull();
  expect(localeFromAcceptLanguage(null)).toBeNull();
});

it("reads the negotiated locale and source from the forwarded request headers", () => {
  const headers = new Headers({ [LOCALE_HEADER]: "fr", [LOCALE_SOURCE_HEADER]: "query" });
  expect(localeFromRequestHeaders(headers)).toEqual({ locale: "fr", source: "query" });
  expect(localeFromRequestHeaders(new Headers())).toEqual({ locale: "en", source: "default" });
  expect(localeFromRequestHeaders(new Headers({ [LOCALE_HEADER]: "de", [LOCALE_SOURCE_HEADER]: "nonsense" }))).toEqual({ locale: "en", source: "default" });
});

it("parses the locale out of a Cookie header without matching similarly named cookies", () => {
  expect(localeFromCookieHeader("a=1; lobbystack.locale=fr; b=2")).toBe("fr");
  expect(localeFromCookieHeader("lobbystack.locale=fr-CA")).toBe("fr");
  expect(localeFromCookieHeader("lobbystack.locale-copy=fr")).toBeNull();
  expect(localeFromCookieHeader(undefined)).toBeNull();
  expect(localeFromCookieHeader("lobbystack.locale=%E0%A4%A")).toBeNull();
});
