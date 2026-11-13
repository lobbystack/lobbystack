// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PhoneInput } from "./phone-input";

afterEach(cleanup);

function Field(props: { country: "FR" }) {
  const [value, setValue] = useState<string | undefined>(undefined);
  return <PhoneInput aria-label="phone" locale="en" onChange={setValue} value={value ?? ""} {...props} />;
}

const digits = (input: HTMLElement) => (input as HTMLInputElement).value.replace(/\D/g, "");

describe("PhoneInput digit cap", () => {
  it("stops at the most digits a French number has when a country is picked", async () => {
    render(<Field country="FR" />);
    await userEvent.type(screen.getByLabelText("phone"), "6123456789012345");
    expect(digits(screen.getByLabelText("phone"))).toBe("612345678");
  });

  it("allows a typed leading 0 on top of the cap and shows the number without it", async () => {
    render(<Field country="FR" />);
    await userEvent.type(screen.getByLabelText("phone"), "06123456789999");
    expect(digits(screen.getByLabelText("phone"))).toBe("612345678");
  });
});
