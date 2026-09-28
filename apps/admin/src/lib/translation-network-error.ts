/**
 * A translation request that never got an HTTP response: the connection
 * dropped, the browser went offline, or Safari reported "Load failed". It is
 * not an application fault, so it is shown to the operator but not reported.
 */
export class TranslationNetworkError extends Error {
  constructor(url: string, options: { cause: unknown }) {
    super(`Network error while loading ${url}.`, options);
    this.name = "TranslationNetworkError";
  }
}

/** True when every failure behind `error` is a translation network error. */
export function isTranslationNetworkError(error: unknown): boolean {
  if (error instanceof AggregateError) return error.errors.length > 0 && error.errors.every(isTranslationNetworkError);
  return error instanceof TranslationNetworkError;
}
