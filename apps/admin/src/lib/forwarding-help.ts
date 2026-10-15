// The docs have French and Spanish pages; Serbian readers get the English one.
export function forwardingHelpUrl(language: string): string {
  return language === "fr" || language === "es"
    ? `https://docs.lobbystack.com/${language}/getting-started/claim-your-number`
    : "https://docs.lobbystack.com/getting-started/claim-your-number#using-your-existing-business-number";
}
