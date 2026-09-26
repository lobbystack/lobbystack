// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, it } from "vitest";

import { createI18nInstance } from "@/i18n";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { routeNamespaces } from "@/lib/route-namespaces";

import { WebsiteImportProgress, type WebsiteImportSummary } from "./website-import-progress";

/**
 * The card renders on both the dashboard and the onboarding flow, and those
 * routes load different namespaces. Building the instance the way the server
 * does catches a namespace this surface asks for but its route never ships.
 */
function renderOn(pathname: string, job: WebsiteImportSummary) {
  const instance = createI18nInstance({ locale: "en", resources: resourcesForRoute("en", routeNamespaces(pathname)) });
  render(<I18nextProvider i18n={instance}><WebsiteImportProgress job={job} /></I18nextProvider>);
}

afterEach(cleanup);

const crawling: WebsiteImportSummary = { status: "crawling", websiteUrl: "https://resend.com", importedCount: 3, indexedCount: 1 };

it("shows crawl progress on the dashboard, which does not load the onboarding namespace", () => {
  renderOn("/", crawling);
  expect(screen.getByText("Reading resend.com")).toBeTruthy();
  expect(screen.getByText("3 pages read so far, 1 ready for questions.")).toBeTruthy();
});

it("shows crawl progress during onboarding", () => {
  renderOn("/onboarding/knowledge", crawling);
  expect(screen.getByText("Reading resend.com")).toBeTruthy();
});

it("counts the pages it finished reading", () => {
  renderOn("/", { status: "completed", websiteUrl: "https://resend.com", importedCount: 4, indexedCount: 1 });
  expect(screen.getByText("Your agent has read resend.com")).toBeTruthy();
  expect(screen.getByText("1 page is ready for questions.")).toBeTruthy();
});

it("points a failed import at details the operator can add anywhere it renders", () => {
  renderOn("/onboarding/greeting", { status: "failed", websiteUrl: "https://resend.com", importedCount: 0, indexedCount: 0 });
  expect(screen.getByText("We couldn't read resend.com")).toBeTruthy();
  // The card also sits above the greeting field, so the hint cannot send
  // anyone to a form "below" it.
  expect(screen.getByText(/Add your business details by hand/)).toBeTruthy();
});
