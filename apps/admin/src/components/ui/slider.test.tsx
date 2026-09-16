// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Slider } from "./slider";

describe("Slider", () => {
  it("renders a single thumb for scalar values", () => {
    const { container } = render(<Slider max={100} min={0} value={25} />);

    expect(container.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(1);
  });

  it("renders one thumb per array value", () => {
    const { container } = render(<Slider max={100} min={0} value={[25, 75]} />);

    expect(container.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(2);
  });
});

afterEach(cleanup);
