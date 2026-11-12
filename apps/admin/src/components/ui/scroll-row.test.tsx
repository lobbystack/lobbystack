// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { revealInRow, ScrollRow } from "./scroll-row";
import { SegmentedControl, SegmentedControlItem, Tabs, TabsList, TabsTrigger } from "./tabs";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Lays out a row `width` wide with items 100px wide, side by side from x=0, scrolled by the row's scrollLeft. */
function layOut(row: HTMLElement, width: number) {
  vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => ({ left: 0, right: width, top: 0, bottom: 36, width, height: 36, x: 0, y: 0, toJSON: () => ({}) }));
  [...row.children].forEach((item, index) => {
    vi.spyOn(item as HTMLElement, "getBoundingClientRect").mockImplementation(() => {
      const left = index * 100 - row.scrollLeft;
      return { left, right: left + 100, top: 0, bottom: 36, width: 100, height: 36, x: left, y: 0, toJSON: () => ({}) };
    });
  });
}

describe("scroll rows", () => {
  it("scrolls just enough to show an item cut off on the right, then on the left", () => {
    const row = document.createElement("div");
    row.innerHTML = "<span></span><span></span><span></span><span></span>";
    document.body.append(row);
    layOut(row, 250);
    revealInRow(row, row.children[2] as HTMLElement);
    expect(row.scrollLeft).toBe(50);
    revealInRow(row, row.children[0] as HTMLElement);
    expect(row.scrollLeft).toBe(0);
    row.remove();
  });

  it("leaves the row alone when the item already shows whole", () => {
    const row = document.createElement("div");
    row.innerHTML = "<span></span><span></span>";
    document.body.append(row);
    layOut(row, 250);
    revealInRow(row, row.children[1] as HTMLElement);
    expect(row.scrollLeft).toBe(0);
    row.remove();
  });

  it("gives every tab row, segmented control and chip row the same scroll-and-clip class", () => {
    render(
      <>
        <Tabs defaultValue="a"><TabsList aria-label="Default"><TabsTrigger value="a">A</TabsTrigger></TabsList></Tabs>
        <Tabs defaultValue="a"><TabsList aria-label="Pills" variant="pills"><TabsTrigger value="a">A</TabsTrigger></TabsList></Tabs>
        <Tabs defaultValue="a"><TabsList aria-label="Line" variant="line"><TabsTrigger value="a">A</TabsTrigger></TabsList></Tabs>
        <SegmentedControl aria-label="Segmented" value="a"><SegmentedControlItem value="a">A</SegmentedControlItem></SegmentedControl>
        <ScrollRow aria-label="Chips" role="group"><button type="button">All</button></ScrollRow>
      </>,
    );
    const classes = (name: string) => (screen.getByLabelText(name).className as string).split(" ");
    for (const name of ["Default", "Pills", "Line"]) {
      // Only a horizontal list scrolls; a vertical one stacks.
      expect(classes(name)).toContain("group-data-horizontal/tabs:scroll-row");
      expect(classes(name)).toContain("justify-start");
      expect(classes(name)).not.toContain("inline-flex");
    }
    // Pills have no padding of their own, so the row lends focus rings room above and below.
    expect(classes("Pills")).toContain("group-data-horizontal/tabs:scroll-row-bleed");
    expect(classes("Segmented")).toContain("scroll-row");
    expect(classes("Chips")).toContain("scroll-row");
  });

  it("scrolls the chosen tab into view when it's picked", async () => {
    const view = render(<Tabs defaultValue="a"><TabsList aria-label="Tabs">{["a", "b", "c", "d"].map((value) => <TabsTrigger key={value} value={value}>{value}</TabsTrigger>)}</TabsList></Tabs>);
    const row = screen.getByLabelText("Tabs");
    layOut(row, 250);
    await act(async () => { screen.getByRole("tab", { name: "d" }).click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(row.scrollLeft).toBe(150);
    view.unmount();
  });

  it("scrolls the pressed chip into view", async () => {
    const view = render(<ScrollRow aria-label="Chips">{["All", "Phone", "Website", "SMS"].map((label) => <button aria-pressed={label === "All"} key={label} type="button">{label}</button>)}</ScrollRow>);
    const row = screen.getByLabelText("Chips");
    layOut(row, 250);
    await act(async () => {
      screen.getByRole("button", { name: "All" }).setAttribute("aria-pressed", "false");
      screen.getByRole("button", { name: "SMS" }).setAttribute("aria-pressed", "true");
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(row.scrollLeft).toBe(150);
    view.unmount();
  });
});
