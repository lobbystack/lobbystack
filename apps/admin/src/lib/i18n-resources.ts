import type { SupportedLocale } from "./locale";

import enAdmin from "../../public/locales/en/admin.json";
import enAffiliate from "../../public/locales/en/affiliate.json";
import enAgent from "../../public/locales/en/agent.json";
import enAuth from "../../public/locales/en/auth.json";
import enCalls from "../../public/locales/en/calls.json";
import enCommon from "../../public/locales/en/common.json";
import enContacts from "../../public/locales/en/contacts.json";
import enDashboard from "../../public/locales/en/dashboard.json";
import enDemos from "../../public/locales/en/demos.json";
import enInbox from "../../public/locales/en/inbox.json";
import enKnowledge from "../../public/locales/en/knowledge.json";
import enMessages from "../../public/locales/en/messages.json";
import enNav from "../../public/locales/en/nav.json";
import enOnboarding from "../../public/locales/en/onboarding.json";
import enSettings from "../../public/locales/en/settings.json";
import enWidget from "../../public/locales/en/widget.json";
import frAdmin from "../../public/locales/fr/admin.json";
import frAffiliate from "../../public/locales/fr/affiliate.json";
import frAgent from "../../public/locales/fr/agent.json";
import frAuth from "../../public/locales/fr/auth.json";
import frCalls from "../../public/locales/fr/calls.json";
import frCommon from "../../public/locales/fr/common.json";
import frContacts from "../../public/locales/fr/contacts.json";
import frDashboard from "../../public/locales/fr/dashboard.json";
import frDemos from "../../public/locales/fr/demos.json";
import frInbox from "../../public/locales/fr/inbox.json";
import frKnowledge from "../../public/locales/fr/knowledge.json";
import frMessages from "../../public/locales/fr/messages.json";
import frNav from "../../public/locales/fr/nav.json";
import frOnboarding from "../../public/locales/fr/onboarding.json";
import frSettings from "../../public/locales/fr/settings.json";
import frWidget from "../../public/locales/fr/widget.json";

/**
 * Locale bundles available to server rendering. The admin app ships one namespace per
 * surface plus shared chrome, and each route only carries the namespaces it needs.
 */
export const localeResources: Record<SupportedLocale, Record<string, Record<string, unknown>>> = {
  en: {
    admin: enAdmin,
    affiliate: enAffiliate,
    agent: enAgent,
    auth: enAuth,
    calls: enCalls,
    common: enCommon,
    contacts: enContacts,
    dashboard: enDashboard,
    demos: enDemos,
    inbox: enInbox,
    knowledge: enKnowledge,
    messages: enMessages,
    nav: enNav,
    onboarding: enOnboarding,
    settings: enSettings,
    widget: enWidget,
  },
  fr: {
    admin: frAdmin,
    affiliate: frAffiliate,
    agent: frAgent,
    auth: frAuth,
    calls: frCalls,
    common: frCommon,
    contacts: frContacts,
    dashboard: frDashboard,
    demos: frDemos,
    inbox: frInbox,
    knowledge: frKnowledge,
    messages: frMessages,
    nav: frNav,
    onboarding: frOnboarding,
    settings: frSettings,
    widget: frWidget,
  },
};

/** Selects the requested namespaces for a locale, skipping unknown ones. */
export function resourcesForRoute(
  locale: SupportedLocale,
  namespaces: readonly string[],
): Record<string, Record<string, unknown>> {
  const bundle = localeResources[locale];
  const selected: Record<string, Record<string, unknown>> = {};
  for (const namespace of namespaces) {
    const resources = bundle[namespace];
    if (resources) selected[namespace] = resources;
  }
  return selected;
}

