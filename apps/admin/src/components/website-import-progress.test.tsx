// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createI18nInstance } from "@/i18n";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { routeNamespaces } from "@/lib/route-namespaces";

import { currentWebsiteImport, WebsiteImportProgress, type WebsiteImportSummary } from "./website-import-progress";

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

describe("choosing which crawl to show", () => {
  const abandoned: WebsiteImportSummary = { status: "failed", websiteUrl: "https://aaa-abandoned.example", importedCount: 0, indexedCount: 0 };
  const current: WebsiteImportSummary = { status: "crawling", websiteUrl: "https://zzz-current.example", importedCount: 2, indexedCount: 0 };

  it("follows the newest import, not whichever title sorts first", () => {
    // The knowledge list arrives ordered by title, so the abandoned site leads.
    const documents = [
      { createdAt: "2026-09-01T10:00:00.000Z", websiteImport: abandoned },
      { createdAt: "2026-09-02T10:00:00.000Z", websiteImport: current },
    ];
    expect(currentWebsiteImport(documents)?.websiteUrl).toBe("https://zzz-current.example");
  });

  it("ignores documents that carry no import at all", () => {
    const documents = [
      { createdAt: "2026-09-03T10:00:00.000Z" },
      { createdAt: "2026-09-02T10:00:00.000Z", websiteImport: current },
    ];
    expect(currentWebsiteImport(documents)?.websiteUrl).toBe("https://zzz-current.example");
  });

  it("follows the business's own site after a URL is resubmitted, even though another import is newer", () => {
    // Submit A, then B, then A again: A reuses its first import, so B stays the
    // newest row while the business has settled back on A.
    const siteA: WebsiteImportSummary = { status: "crawling", websiteUrl: "https://a.example", importedCount: 3, indexedCount: 0 };
    const siteB: WebsiteImportSummary = { status: "completed", websiteUrl: "https://b.example", importedCount: 10, indexedCount: 10 };
    const documents = [
      { createdAt: "2026-09-01T10:00:00.000Z", websiteImport: siteA },
      { createdAt: "2026-09-02T10:00:00.000Z", websiteImport: siteB },
    ];
    expect(currentWebsiteImport(documents, "https://a.example")?.websiteUrl).toBe("https://a.example");
    // With no match, the newest import still wins.
    expect(currentWebsiteImport(documents, "https://elsewhere.example")?.websiteUrl).toBe("https://b.example");
  });

  it("reports nothing when the workspace has never imported a site", () => {
    expect(currentWebsiteImport([{ createdAt: "2026-09-03T10:00:00.000Z" }])).toBeNull();
    expect(currentWebsiteImport(undefined)).toBeNull();
  });
});
