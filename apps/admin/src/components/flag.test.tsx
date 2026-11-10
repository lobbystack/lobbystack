// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Flag } from "./flag";

// A region whose chunk fails to load stands in for a network error; every other region loads as usual.
vi.mock("@/lib/country-flag-components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/country-flag-components")>();
  return {
    ...actual,
    hasFlagComponent: (region: string) => region === "QQ" || actual.hasFlagComponent(region),
    loadFlagComponent: (region: string) => region === "QQ" ? Promise.reject(new Error("chunk failed")) : actual.loadFlagComponent(region),
  };
});

afterEach(cleanup);

it("renders the region's flag with its data attribute, whatever the case", async () => {
  const { container } = render(<Flag region="rs" />);
  const flag = container.firstElementChild!;
  expect(flag.getAttribute("data-flag")).toBe("RS");
  expect(flag.getAttribute("aria-hidden")).toBe("true");
  await waitFor(() => expect(flag.querySelector("svg")).not.toBeNull());
});

it("shows a globe when there is no region", () => {
  const { container } = render(<Flag region={null} />);
  expect(container.querySelector("svg")).not.toBeNull();
  expect(container.querySelector("[data-flag]")).toBeNull();
});

it("shows a globe for a region the package has no flag for", () => {
  const { container } = render(<Flag region="XX" />);
  expect(container.querySelector("[data-flag]")).toBeNull();
});

it("shows a globe when the flag's chunk fails to load, never an empty box", async () => {
  const { container } = render(<Flag region="QQ" />);
  await waitFor(() => expect(container.querySelector("[data-flag]")).toBeNull());
  expect(container.querySelector("svg")).not.toBeNull();
});
