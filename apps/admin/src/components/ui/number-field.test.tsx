// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { NumberField } from "./number-field";

afterEach(cleanup);

function Harness({ start = 30, integer = false }: { start?: number; integer?: boolean }) {
  const [value, setValue] = useState<number | null>(start);
  return <NumberField allowOutOfRange aria-label="Minutes" integer={integer} decrementLabel="Decrease" incrementLabel="Increase" invalid={value === null || value < 5 || value > 720} max={720} min={5} onValueChange={setValue} step={5} value={value} />;
}

describe("NumberField", () => {
  it("steps by the step with its buttons and the arrow keys, and stops at the ends", async () => {
    render(<Harness start={715} />);
    const input = screen.getByRole("textbox", { name: "Minutes" }) as HTMLInputElement;
    await userEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(input.value).toBe("720");
    expect(screen.getByRole("button", { name: "Increase" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Decrease" }));
    expect(input.value).toBe("715");
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowDown}");
    expect(input.value).toBe("710");
  });

  it("doesn't take letters, and marks a value outside the range as invalid", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Minutes" }) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "1e");
    expect(input.value).toBe("1");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(input, "5");
    expect(input.value).toBe("15");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("takes only digits as an integer field: no commas, decimal point or sign, typed or pasted", async () => {
    render(<Harness integer />);
    const input = screen.getByRole("textbox", { name: "Minutes" }) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "6,0.2,-3");
    expect(input.value).toBe("6023");
    await userEvent.tab();
    expect(input.value).toBe("6023");
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste("1,2.5e");
    expect(input.value).toBe("125");
  });
});
