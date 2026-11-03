import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import SetupGuidePage from "./page";

describe("/setup-guide", () => {
  it("sends old links to Home", () => {
    SetupGuidePage();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
