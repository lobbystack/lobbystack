import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PhoneInput } from "@/components/ui/phone-input";

function PhoneInputHarness({
  country,
  defaultCountry = "US",
  locale = "en-US",
}: {
  country?: "US" | "CA" | "FR" | "GB" | "AU";
  defaultCountry?: "US" | "CA" | "FR" | "GB" | "AU";
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
        {...(country !== undefined ? { country } : {})}
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

  it("uses the configured default country for parsing", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness defaultCountry="FR" locale="fr-CA" />);
    await user.type(screen.getByRole("textbox", { name: "Phone" }), "612345678");

    expect(screen.getByTestId("phone-value").textContent).toBe("+33612345678");
  });

  it("uses the configured fixed country for parsing", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness country="GB" defaultCountry="US" locale="en-US" />);
    await user.type(screen.getByRole("textbox", { name: "Phone" }), "7911123456");

    expect(screen.getByTestId("phone-value").textContent).toBe("+447911123456");
  });

  it("clears back to an empty value", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness defaultCountry="CA" locale="en-CA" />);

    const input = screen.getByRole("textbox", { name: "Phone" });
    await user.type(input, "5145550123");
    await user.clear(input);

    expect(screen.getByTestId("phone-value").textContent).toBe("");
  });

  it("allows deleting partial input without re-inserting the country code", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness defaultCountry="US" locale="en-US" />);

    const input = screen.getByRole("textbox", { name: "Phone" }) as HTMLInputElement;
    await user.type(input, "231232");
    expect(input.value).toBe("(231) 232");

    await user.keyboard("[Backspace]");

    expect(input.value).toBe("(231) 23");
    expect(input.value).not.toBe("(231) 232-1");
  });

  it("allows deleting partial input with a fixed country", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness country="AU" defaultCountry="US" locale="en-US" />);

    const input = screen.getByRole("textbox", { name: "Phone" }) as HTMLInputElement;
    await user.type(input, "0412345");
    const valueBeforeBackspace = input.value;

    await user.keyboard("[Backspace]");

    expect(input.value).not.toBe(valueBeforeBackspace);
    expect(input.value.length).toBeLessThan(valueBeforeBackspace.length);
  });
});
