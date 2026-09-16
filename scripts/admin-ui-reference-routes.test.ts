import { describe, expect, it } from "vitest";
import { referenceUiRoutes } from "./admin-ui-reference-routes";
describe("frozen React Router inventory", () => {
  it("resolves nested relative and index routes, including conditional pages", () => {
    expect(referenceUiRoutes('const app = <Routes><Route path="/settings/*"><Route index /><Route path="usage" />{enabled && <Route path="plan/compliance" />}</Route><Route path="/demo/:token" /></Routes>')).toEqual(["/demo/:token", "/settings", "/settings/plan/compliance", "/settings/usage"]);
  });
  it("ignores catch-all redirects and ordinary element path attributes", () => {
    expect(referenceUiRoutes('const app = <Routes><Route path="/agent/*"><Route path="knowledge" /><Route path="*" /></Route><Route path="*" /><svg><path path="not-a-route" /></svg></Routes>')).toEqual(["/agent", "/agent/knowledge"]);
  });
  it("preserves absolute child paths and pathless layout ancestry", () => {
    expect(referenceUiRoutes('const app = <Routes><Route path="/onboarding"><Route><Route path={"business"} /><Route path="/login" /></Route></Route></Routes>')).toEqual(["/login", "/onboarding", "/onboarding/business"]);
  });
});
