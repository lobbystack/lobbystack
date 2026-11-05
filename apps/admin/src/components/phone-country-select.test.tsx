// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhoneCountrySelect } from "./phone-country-select";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

const countries = [
  { code: "US", label: "United States", callingCode: "+1" },
  { code: "RS", label: "Serbia", callingCode: "+381" },
] as const;

describe("PhoneCountrySelect", () => {
  it("shows a flag on each country and clears the typed search", async () => {
    render(<PhoneCountrySelect ariaLabel="Country" countries={[...countries]} onChange={vi.fn()} value="US" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Country" }));
    expect(await screen.findByText("🇷🇸")).toBeTruthy();
    const search = screen.getByPlaceholderText("phoneCountry.search") as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "accessibility.clearSearch" })).toBeNull();
    await user.type(search, "serb");
    expect(screen.queryByText("United States")).toBeNull();
    await user.click(screen.getByRole("button", { name: "accessibility.clearSearch" }));
    expect(search.value).toBe("");
    expect(screen.getByText("United States")).toBeTruthy();
  });
});
