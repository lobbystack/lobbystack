// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchInput } from "./search-input";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState("");
  return <SearchInput aria-label="Search" onValueChange={setValue} value={value} />;
}

describe("SearchInput", () => {
  it("shows a clear button once something is typed, and empties the field when it is clicked", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Search") as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "accessibility.clearSearch" })).toBeNull();
    await userEvent.type(input, "ab");
    expect(input.value).toBe("ab");
    await userEvent.click(screen.getByRole("button", { name: "accessibility.clearSearch" }));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "accessibility.clearSearch" })).toBeNull();
  });
});
