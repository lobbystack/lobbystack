// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DurationPicker } from "@/components/ui/duration-picker";

afterEach(cleanup);

const columnLabels = { hours: "Hours", minutes: "Minutes" };
const columnTitles = { hours: "Titre heures", minutes: "Titre minutes" };

async function open(value: number, limits: { minMinutes?: number; maxMinutes?: number } = { minMinutes: 5, maxMinutes: 720 }) {
  const onChange = vi.fn();
  render(<DurationPicker aria-label="Duration" columnLabels={columnLabels} columnTitles={columnTitles} locale="en" onChange={onChange} value={value} {...limits} />);
  await userEvent.click(screen.getByRole("button", { name: "Duration" }));
  const options = (label: string) => within(screen.getByRole("listbox", { name: label })).getAllByRole("option").map((option) => option.textContent);
  return { onChange, hours: () => options("Hours"), minutes: () => options("Minutes") };
}

describe("DurationPicker", () => {
  it("shows the titles it is given above the columns", async () => {
    await open(60);
    expect(screen.getByText("Titre heures")).toBeTruthy();
    expect(screen.getByText("Titre minutes")).toBeTruthy();
  });

  it("offers no 0h 0m when the form wants at least five minutes", async () => {
    const picker = await open(60);
    expect(picker.hours()[0]).toBe("0");
    // At 0 hours the minutes start at 05.
    await userEvent.click(screen.getByRole("option", { name: "0" }));
    expect(picker.onChange).toHaveBeenCalledWith(5);
  });

  it("offers only 12h 00m on the twelfth hour when the form allows at most twelve hours", async () => {
    const picker = await open(12 * 60);
    expect(picker.hours().at(-1)).toBe("12");
    expect(picker.minutes()).toEqual(["00"]);
  });

  it("pulls a choice that would leave the range back inside it", async () => {
    const picker = await open(11 * 60 + 30);
    await userEvent.click(screen.getByRole("option", { name: "12" }));
    expect(picker.onChange).toHaveBeenCalledWith(720);
  });

  it("keeps a saved length that is off the lists selectable", async () => {
    const picker = await open(7);
    expect(picker.minutes()).toContain("07");
  });

  it("offers every minute step when the limits allow it", async () => {
    const picker = await open(60, { minMinutes: 1, maxMinutes: 720 });
    expect(picker.minutes()).toHaveLength(12);
  });
});
