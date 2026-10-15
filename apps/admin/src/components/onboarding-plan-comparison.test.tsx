// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { createInstance } from "i18next";
import { afterEach, expect, it } from "vitest";
import en from "../../public/locales/en/onboarding.json";
import fr from "../../public/locales/fr/onboarding.json";
import { OnboardingPlanComparison } from "./onboarding-plan-comparison";

afterEach(cleanup);

const cells = (feature: string) => within(screen.getByText(feature).closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent);

it.each([
  ["en", { minutes: "30 included", numbers: "Phone numbers", trial: "Free for 14 days", history: "Call history and recordings", notIncluded: "Not included", noFree: ["Appointment confirmation texts", "SMS notifications", "Alert SMS segments", "Transfer attempts"] }],
  ["fr", { minutes: "30 incluses", numbers: "Numéros de téléphone", trial: "Gratuit 14 jours", history: "Historique et enregistrements d'appels", notIncluded: "Non inclus", noFree: ["SMS de confirmation de rendez‑vous", "Notifications SMS", "Segments SMS d'alerte", "Tentatives de transfert"] }],
] as const)("describes supported capabilities in %s", async (locale, text) => {
  const i18n = createInstance();
  await i18n.init({ lng: locale, resources: { en: { onboarding: en }, fr: { onboarding: fr } } });
  render(<OnboardingPlanComparison locale={locale} t={i18n.getFixedT(locale, "onboarding")} />);
  expect(screen.queryByText(/Outlook/)).toBeNull();
  expect(screen.getByText(text.minutes)).toBeTruthy();
  expect(cells(text.numbers)[1]).toBe(text.trial);
  for (const feature of text.noFree) expect(cells(feature)[1]).toBe(text.notIncluded);
  // Recordings and transcripts are kept 30 days on Free and 90 on paid plans.
  expect(cells(text.history).slice(1, 4)).toEqual(locale === "en" ? ["30 days", "90 days", "90 days"] : ["30 jours", "90 jours", "90 jours"]);
});
