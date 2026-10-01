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
import esAdmin from "../../public/locales/es/admin.json";
import esAffiliate from "../../public/locales/es/affiliate.json";
import esAgent from "../../public/locales/es/agent.json";
import esAuth from "../../public/locales/es/auth.json";
import esCalls from "../../public/locales/es/calls.json";
import esCommon from "../../public/locales/es/common.json";
import esContacts from "../../public/locales/es/contacts.json";
import esDashboard from "../../public/locales/es/dashboard.json";
import esDemos from "../../public/locales/es/demos.json";
import esInbox from "../../public/locales/es/inbox.json";
import esKnowledge from "../../public/locales/es/knowledge.json";
import esMessages from "../../public/locales/es/messages.json";
import esNav from "../../public/locales/es/nav.json";
import esOnboarding from "../../public/locales/es/onboarding.json";
import esSettings from "../../public/locales/es/settings.json";
import esWidget from "../../public/locales/es/widget.json";
import srAdmin from "../../public/locales/sr/admin.json";
import srAffiliate from "../../public/locales/sr/affiliate.json";
import srAgent from "../../public/locales/sr/agent.json";
import srAuth from "../../public/locales/sr/auth.json";
import srCalls from "../../public/locales/sr/calls.json";
import srCommon from "../../public/locales/sr/common.json";
import srContacts from "../../public/locales/sr/contacts.json";
import srDashboard from "../../public/locales/sr/dashboard.json";
import srDemos from "../../public/locales/sr/demos.json";
import srInbox from "../../public/locales/sr/inbox.json";
import srKnowledge from "../../public/locales/sr/knowledge.json";
import srMessages from "../../public/locales/sr/messages.json";
import srNav from "../../public/locales/sr/nav.json";
import srOnboarding from "../../public/locales/sr/onboarding.json";
import srSettings from "../../public/locales/sr/settings.json";
import srWidget from "../../public/locales/sr/widget.json";

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
  es: {
    admin: esAdmin,
    affiliate: esAffiliate,
    agent: esAgent,
    auth: esAuth,
    calls: esCalls,
    common: esCommon,
    contacts: esContacts,
    dashboard: esDashboard,
    demos: esDemos,
    inbox: esInbox,
    knowledge: esKnowledge,
    messages: esMessages,
    nav: esNav,
    onboarding: esOnboarding,
    settings: esSettings,
    widget: esWidget,
  },
  sr: {
    admin: srAdmin,
    affiliate: srAffiliate,
    agent: srAgent,
    auth: srAuth,
    calls: srCalls,
    common: srCommon,
    contacts: srContacts,
    dashboard: srDashboard,
    demos: srDemos,
    inbox: srInbox,
    knowledge: srKnowledge,
    messages: srMessages,
    nav: srNav,
    onboarding: srOnboarding,
    settings: srSettings,
    widget: srWidget,
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

