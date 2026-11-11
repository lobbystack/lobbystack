import { LOBBYSTACK_DOCS_URL, brandLinks } from "@lobbystack/shared";

// LobbyStack's Help Center has French and Spanish pages; Serbian readers, and
// every reader of a deployment's own docs, get the path as it is.
export function helpCenterUrl(path: `/${string}`, language: string): string {
  const { docsUrl } = brandLinks();
  const localized = docsUrl === LOBBYSTACK_DOCS_URL && (language === "fr" || language === "es");
  return `${docsUrl}${localized ? `/${language}` : ""}${path}`;
}
