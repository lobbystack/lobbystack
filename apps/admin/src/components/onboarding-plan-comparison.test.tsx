// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { createInstance } from "i18next";
import { afterEach, expect, it } from "vitest";
import en from "../../public/locales/en/onboarding.json";
import fr from "../../public/locales/fr/onboarding.json";
import { OnboardingPlanComparison } from "./onboarding-plan-comparison";

afterEach(cleanup);

it.each(["en", "fr"] as const)("describes supported capabilities in %s", async (locale) => {
  const i18n = createInstance();
  await i18n.init({ lng: locale, resources: { en: { onboarding: en }, fr: { onboarding: fr } } });
  const t = i18n.getFixedT(locale, "onboarding");
  render(<OnboardingPlanComparison t={t} />);
  expect(screen.queryByText(/Outlook/)).toBeNull();
  expect(screen.getByText(/30 browser minutes|30 minutes dans le navigateur/)).toBeTruthy();
  const numbers = screen.getByText(t("plan.comparison.features.phoneNumbers")).closest("tr")!;
  expect(within(numbers).getAllByRole("cell")[1]?.textContent).toBe(t("plan.comparison.values.common.notIncluded"));
  expect(screen.getAllByText(t("plan.comparison.values.notifications.aiSms.proIncluded"))).toHaveLength(2);
  const retention = screen.getByText(t("plan.comparison.features.contentRetention")).closest("tr")!;
  const retentionCells = within(retention).getAllByRole("cell");
  expect(retentionCells[1]?.textContent).toBe(t("plan.comparison.values.data.contentRetention.free", { days: 30 }));
  expect(retentionCells[2]?.textContent).toBe(t("plan.comparison.values.data.contentRetention.paid", { days: 90 }));
  expect(retentionCells[3]?.textContent).toBe(t("plan.comparison.values.data.contentRetention.paid", { days: 90 }));
});
