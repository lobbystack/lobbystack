import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PhoneInput } from "@/components/ui/phone-input";

function PhoneInputHarness({
  country,
  defaultCountry = "US",
  limitNationalDigits = false,
  locale = "en-US",
}: {
  country?: "US" | "CA" | "FR" | "GB" | "AU";
  defaultCountry?: "US" | "CA" | "FR" | "GB" | "AU";
  limitNationalDigits?: boolean;
  locale?: string;
}) {
  const [value, setValue] = React.useState<string | undefined>();

  return (
    <div>
      <PhoneInput
        aria-label="Phone"
        defaultCountry={defaultCountry}
        limitNationalDigits={limitNationalDigits}
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

  it("limits US input to ten national digits without counting formatting", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness country="US" limitNationalDigits />);

    await user.type(screen.getByRole("textbox", { name: "Phone" }), "21337342539");

    expect((screen.getByRole("textbox", { name: "Phone" }) as HTMLInputElement).value).toBe(
      "(213) 373-4253",
    );
    expect(screen.getByTestId("phone-value").textContent).toBe("+12133734253");
  });

  it("limits Australian input to the mobile length with the national trunk prefix", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness country="AU" limitNationalDigits />);

    await user.type(screen.getByRole("textbox", { name: "Phone" }), "04123456789");

    expect((screen.getByRole("textbox", { name: "Phone" }) as HTMLInputElement).value).toBe(
      "0412 345 678",
    );
    expect(screen.getByTestId("phone-value").textContent).toBe("+61412345678");
  });

  it("limits UK input to ten digits when the national trunk prefix is omitted", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness country="GB" limitNationalDigits />);

    await user.type(screen.getByRole("textbox", { name: "Phone" }), "79111234567");

    expect((screen.getByRole("textbox", { name: "Phone" }) as HTMLInputElement).value).toBe(
      "7911123456",
    );
    expect(screen.getByTestId("phone-value").textContent).toBe("+447911123456");
  });

  it("prevents pasting too many national digits", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness country="US" limitNationalDigits />);

    const input = screen.getByRole("textbox", { name: "Phone" });
    await user.click(input);
    await user.paste("213373425399");

    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("phone-value").textContent).toBe("");
  });

  it("allows deleting and retyping after extra digits hit the national limit", async () => {
    const user = userEvent.setup();

    render(<PhoneInputHarness country="US" limitNationalDigits />);

    const input = screen.getByRole("textbox", { name: "Phone" }) as HTMLInputElement;
    await user.type(input, "213373425399");
    expect(input.value).toBe("(213) 373-4253");

    await user.keyboard("[Backspace][Backspace]");
    expect(input.value).toBe("(213) 373-42");

    await user.type(input, "99");

    expect(input.value).toBe("(213) 373-4299");
    expect(screen.getByTestId("phone-value").textContent).toBe("+12133734299");
  });
});
