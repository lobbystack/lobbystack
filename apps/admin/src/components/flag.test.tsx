// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Flag } from "./flag";

afterEach(cleanup);

it("renders a hidden flag element for a region, whatever the case", () => {
  const { container } = render(<Flag region="rs" />);
  const flag = container.firstElementChild!;
  expect(flag.className).toContain("flag:RS");
  expect(flag.getAttribute("aria-hidden")).toBe("true");
});

it("shows a globe when there is no region", () => {
  const { container } = render(<Flag region={null} />);
  expect(container.querySelector("svg")).not.toBeNull();
  expect(container.querySelector("[data-flag]")).toBeNull();
});
