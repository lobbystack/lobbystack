import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  normalizeLocale,
  type SupportedLocale,
} from "./locale";

/** Request header carrying the locale the proxy negotiated for this request. */
export const LOCALE_HEADER = "x-lobbystack-locale";
/** Request header describing where the negotiated locale came from. */
export const LOCALE_SOURCE_HEADER = "x-lobbystack-locale-source";
/** Request header carrying the pathname so server components can scope translations. */
export const PATHNAME_HEADER = "x-lobbystack-pathname";

export type LocaleSource = "query" | "cookie" | "header" | "default";

export type NegotiatedLocale = {
  locale: SupportedLocale;
  source: LocaleSource;
};

function isLocaleSource(value: string | null | undefined): value is LocaleSource {
  return value === "query" || value === "cookie" || value === "header" || value === "default";
}

/** Picks the most preferred supported locale out of an `Accept-Language` header. */
export function localeFromAcceptLanguage(value: string | null | undefined): SupportedLocale | null {
  if (!value) {
    return null;
  }

  const candidates = value
    .split(",")
    .map((entry) => {
      const [tag, ...parameters] = entry.split(";");
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="))?.slice(2);
      const parsed = quality === undefined ? 1 : Number(quality);
      return { tag: tag?.trim() ?? "", quality: Number.isFinite(parsed) ? parsed : 0 };
    })
    .filter((candidate) => candidate.tag.length > 0 && candidate.quality > 0)
    .sort((left, right) => right.quality - left.quality);

  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate.tag);
    if (locale) {
      return locale;
    }
  }

  return null;
}

/**
 * Resolves the locale for a request the same way on the server and the client:
 * an explicit `?lng=` wins, then the persisted cookie, then the browser hint.
 */
export function negotiateLocale(input: {
  query?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): NegotiatedLocale {
  const fromQuery = normalizeLocale(input.query);
  if (fromQuery) {
    return { locale: fromQuery, source: "query" };
  }

  const fromCookie = normalizeLocale(input.cookie);
  if (fromCookie) {
    return { locale: fromCookie, source: "cookie" };
  }

  const fromHeader = localeFromAcceptLanguage(input.acceptLanguage);
  if (fromHeader) {
    return { locale: fromHeader, source: "header" };
  }

  return { locale: DEFAULT_LOCALE, source: "default" };
}

/** Reads the negotiated locale from the headers the proxy forwarded. */
export function localeFromRequestHeaders(headers: {
  get(name: string): string | null;
}): NegotiatedLocale {
  const locale = normalizeLocale(headers.get(LOCALE_HEADER));
  const source = headers.get(LOCALE_SOURCE_HEADER);
  return {
    locale: locale ?? DEFAULT_LOCALE,
    source: isLocaleSource(source) ? source : "default",
  };
}

/** Parses a `Cookie` header value for the locale cookie. */
export function localeFromCookieHeader(cookieHeader: string | null | undefined): SupportedLocale | null {
  if (!cookieHeader) {
    return null;
  }

  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (entry.slice(0, separator).trim() !== LOCALE_COOKIE) {
      continue;
    }
    try {
      return normalizeLocale(decodeURIComponent(entry.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }

  return null;
}
