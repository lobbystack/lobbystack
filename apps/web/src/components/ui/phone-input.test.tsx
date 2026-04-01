import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PhoneInput } from "@/components/ui/phone-input";

function PhoneInputHarness({
  defaultCountry = "US",
  locale = "en-US",
}: {
  defaultCountry?: "US" | "CA" | "FR";
  locale?: string;
}) {
  const [value, setValue] = React.useState<string | undefined>();

  return (
    <div>
      <PhoneInput
        aria-label="Phone"
        defaultCountry={defaultCountry}
        locale={locale}
        onChange={setValue}
        value={value}
      />
      <output data-testid="phone-value">{value ?? ""}</output>
    </div>
  );
}

describe("PhoneInput", () => {
  it("emits E.164 values as the user types a valid number", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness />);

    await user.type(screen.getByRole("textbox", { name: "Phone" }), "2133734253");

    expect(screen.getByTestId("phone-value").textContent).toBe("+12133734253");
  });

  it("updates parsing behavior when the selected country changes", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness />);

    await user.click(screen.getByRole("combobox", { name: "Phone number country" }));
    await user.click(screen.getByText("France (+33)"));
    await user.type(screen.getByRole("textbox", { name: "Phone" }), "612345678");

    expect(screen.getByTestId("phone-value").textContent).toBe("+33612345678");
  });

  it("clears back to an empty value", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness defaultCountry="CA" locale="en-CA" />);

    const input = screen.getByRole("textbox", { name: "Phone" });
    await user.type(input, "5145550123");
    await user.clear(input);

    expect(screen.getByTestId("phone-value").textContent).toBe("");
  });
});
