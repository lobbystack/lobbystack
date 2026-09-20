import type { SupportedLocale } from "./locale";
import { localizePublicPath } from "./locale-path";

export function secureDemoRedirect(token: string, locale: SupportedLocale = "en"): string {
  return `${localizePublicPath("/demo", locale)}#${new URLSearchParams({ prospect_demo_token: token }).toString()}`;
}
