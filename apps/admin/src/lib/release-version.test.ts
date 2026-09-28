import { expect, it } from "vitest";
import { releaseVersion } from "./release-version";

it("prefers the deployed commit over a pinned SERVICE_VERSION", () => {
  expect(releaseVersion({ RAILWAY_GIT_COMMIT_SHA: "222c638b", RAILWAY_DEPLOYMENT_ID: "028ec219", SERVICE_VERSION: "faac87ba" })).toBe("222c638b");
});

it("falls back through the deployment ID and SERVICE_VERSION, skipping empty values", () => {
  expect(releaseVersion({ RAILWAY_GIT_COMMIT_SHA: "", RAILWAY_DEPLOYMENT_ID: "028ec219", SERVICE_VERSION: "faac87ba" })).toBe("028ec219");
  expect(releaseVersion({ SERVICE_VERSION: "faac87ba" })).toBe("faac87ba");
  expect(releaseVersion({})).toBe("development");
});
