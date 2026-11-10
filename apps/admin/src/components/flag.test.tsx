// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Flag } from "./flag";

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
