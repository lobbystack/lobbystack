// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../public/locales/en/common.json";
import { AppointmentsCalendar } from "./appointments-calendar";
import { MAX_COLUMN_WIDTH, MAX_HOUR_HEIGHT, MIN_HOUR_HEIGHT } from "./calendar-grid-resize";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const WEEK = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, openMinutes: 9 * 60, closeMinutes: 17 * 60 }));
const haircut = { id: "booking", startsAt: "2026-09-02T10:00:00Z", endsAt: "2026-09-02T11:00:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "not_required", contactName: "Milan", serviceName: "Haircut", staffName: "Sam", serviceId: "service" };

async function setup(days = WEEK) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", defaultNS: "common", resources: { en: { common: en } } });
  render(
    <I18nextProvider i18n={i18n}>
      <AppointmentsCalendar anchor="2026-09-02" appointments={[haircut]} contactName={() => "Milan"} days={days} hours={hours} now={Date.parse("2026-09-02T08:00:00Z")} onAnchorChange={() => {}} onOpenAppointment={() => {}} onViewChange={() => {}} timeOff={[]} timeZone="UTC" today="2026-09-02" view={days.length > 1 ? "week" : "day"} />
    </I18nextProvider>,
  );
  // jsdom lays nothing out, so each day header reports the width it would have.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const width = this.hasAttribute("data-column-header") ? 100 : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
  });
  const grid = screen.getByTestId("calendar-time-grid");
  return { grid };
}

const templates = (grid: HTMLElement) => [...grid.querySelectorAll<HTMLElement>(":scope > div > .grid")].map((element) => element.style.gridTemplateColumns);
const dayColumn = () => document.querySelector<HTMLElement>('[data-day="2026-09-02"]')!;
const columnHandle = (index: number) => screen.getAllByTestId("calendar-column-handle")[index]!;
const rowHandle = (boundary: number) => screen.getAllByTestId("calendar-row-handle")[boundary - 1]!;
const block = () => screen.getByRole("button", { name: /Haircut/ });

describe("resizing a day column", () => {
  it("drags the edge of a day's header to make that column wider, leaving the others to share the rest", async () => {
    const { grid } = await setup();
    expect(templates(grid)).toEqual(Array(2).fill("3.5rem repeat(7, minmax(0, 1fr))"));
    fireEvent.pointerDown(columnHandle(2), { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(columnHandle(2), { clientX: 360, pointerId: 1 });
    expect(templates(grid)).toEqual(Array(2).fill("56px minmax(0, 1fr) minmax(0, 1fr) 160px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)"));
    fireEvent.pointerUp(columnHandle(2), { pointerId: 1 });
    // Moving after the pointer is up changes nothing.
    fireEvent.pointerMove(columnHandle(2), { clientX: 500, pointerId: 1 });
    expect(templates(grid)[0]).toContain("160px");
  });

  it("keeps a column between its smallest and largest width, and a wide week scrolls sideways", async () => {
    const { grid } = await setup();
    fireEvent.pointerDown(columnHandle(0), { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(columnHandle(0), { clientX: -400, pointerId: 1 });
    expect(templates(grid)[0]).toContain("56px 56px");
    fireEvent.pointerMove(columnHandle(0), { clientX: 5_000, pointerId: 1 });
    expect(templates(grid)[0]).toContain(`${MAX_COLUMN_WIDTH}px`);
    expect((grid.firstElementChild as HTMLElement).style.minWidth).toBe(`${56 + MAX_COLUMN_WIDTH + 6 * 60}px`);
  });

  it("widens from the keyboard, and a double click gives the column back to the free space", async () => {
    const { grid } = await setup();
    fireEvent.keyDown(columnHandle(1), { key: "ArrowRight" });
    expect(templates(grid)[0]).toContain("minmax(0, 1fr) 116px minmax(0, 1fr)");
    fireEvent.keyDown(columnHandle(1), { key: "ArrowLeft" });
    fireEvent.keyDown(columnHandle(1), { key: "ArrowLeft" });
    expect(templates(grid)[0]).toContain("84px");
    fireEvent.doubleClick(columnHandle(1));
    expect(templates(grid)).toEqual(Array(2).fill("3.5rem repeat(7, minmax(0, 1fr))"));
  });

  it("fills the rest of the width once every column has one", async () => {
    const { grid } = await setup(WEEK.slice(0, 2));
    fireEvent.keyDown(columnHandle(0), { key: "ArrowRight" });
    fireEvent.keyDown(columnHandle(1), { key: "ArrowRight" });
    expect(templates(grid)[0]).toBe("56px 116px 116px minmax(0, 1fr)");
  });

  it("offers no handle on a single day", async () => {
    await setup(["2026-09-02"]);
    expect(screen.queryAllByTestId("calendar-column-handle")).toHaveLength(0);
  });

  it("names each handle for its day", async () => {
    await setup();
    expect(screen.getByRole("separator", { name: en.appointments.calendarView.resizeColumn.replace("{{day}}", "Wednesday, September 2") })).toBeTruthy();
  });
});

describe("resizing the hour rows", () => {
  it("drags the line under an hour so every row grows by the distance the line moved", async () => {
    await setup();
    const before = dayColumn().style.height;
    expect(block().style.height).toBe("48px");
    fireEvent.pointerDown(rowHandle(1), { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(rowHandle(1), { clientY: 148, pointerId: 1 });
    expect(block().style.height).toBe("96px");
    expect(Number.parseFloat(dayColumn().style.height)).toBe(Number.parseFloat(before) * 2);
    expect(dayColumn().style.backgroundSize).toBe("100% 96px");
  });

  it("shares the distance between the hours above the line, so the line follows the pointer", async () => {
    await setup();
    fireEvent.pointerDown(rowHandle(3), { button: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(rowHandle(3), { clientY: 60, pointerId: 1 });
    expect(block().style.height).toBe("68px");
  });

  it("stops at the smallest and largest row, steps from the keyboard and resets on a double click", async () => {
    await setup();
    fireEvent.pointerDown(rowHandle(1), { button: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(rowHandle(1), { clientY: -500, pointerId: 1 });
    expect(block().style.height).toBe(`${MIN_HOUR_HEIGHT}px`);
    fireEvent.pointerMove(rowHandle(1), { clientY: 900, pointerId: 1 });
    expect(block().style.height).toBe(`${MAX_HOUR_HEIGHT}px`);
    fireEvent.pointerUp(rowHandle(1), { pointerId: 1 });
    fireEvent.doubleClick(rowHandle(1));
    expect(block().style.height).toBe("48px");
    fireEvent.keyDown(rowHandle(1), { key: "ArrowDown" });
    expect(block().style.height).toBe("56px");
    fireEvent.keyDown(rowHandle(1), { key: "ArrowUp" });
    fireEvent.keyDown(rowHandle(1), { key: "ArrowUp" });
    expect(block().style.height).toBe("40px");
  });

  it("makes only the first line a tab stop", async () => {
    await setup();
    const stops = screen.getAllByTestId("calendar-row-handle").map((handle) => handle.tabIndex);
    expect(stops[0]).toBe(0);
    expect(stops.slice(1).every((tabIndex) => tabIndex === -1)).toBe(true);
  });
});

describe("pinching the grid on a phone", () => {
  const touches = (first: [number, number], second: [number, number]) => ({ touches: [{ clientX: first[0], clientY: first[1] }, { clientX: second[0], clientY: second[1] }] });

  it("scales the rows and the columns by how far the fingers spread on each axis", async () => {
    const { grid } = await setup();
    fireEvent.touchStart(grid, touches([100, 100], [200, 200]));
    fireEvent.touchMove(grid, touches([50, 100], [250, 250]));
    // The fingers moved from 100 to 200 apart across and from 100 to 150 apart down.
    expect(block().style.height).toBe("72px");
    expect(templates(grid)[0]).toBe(`56px ${Array(7).fill("200px").join(" ")} minmax(0, 1fr)`);
  });

  it("cancels the browser's own zoom and scroll while two fingers are down, and only then", async () => {
    const { grid } = await setup();
    const move = (touchList: ReturnType<typeof touches>["touches"]) => {
      const event = new Event("touchmove", { bubbles: true, cancelable: true });
      Object.assign(event, { touches: touchList });
      act(() => { grid.dispatchEvent(event); });
      return event.defaultPrevented;
    };
    const one = [{ clientX: 0, clientY: 0 }];
    fireEvent.touchStart(grid, { touches: one });
    expect(move(one)).toBe(false);
    fireEvent.touchStart(grid, touches([0, 0], [100, 100]));
    expect(move(touches([0, 0], [150, 150]).touches)).toBe(true);
    fireEvent.touchEnd(grid, { touches: one });
    expect(move(touches([0, 0], [200, 200]).touches)).toBe(false);
  });

  it("scales both axes together when the fingers sit almost in line", async () => {
    const { grid } = await setup();
    fireEvent.touchStart(grid, touches([100, 100], [200, 105]));
    fireEvent.touchMove(grid, touches([50, 100], [250, 110]));
    expect(block().style.height).toBe("96px");
  });

  it("zooms the rows only in the day view, which has no columns to size", async () => {
    const { grid } = await setup(["2026-09-02"]);
    fireEvent.touchStart(grid, touches([100, 100], [200, 200]));
    fireEvent.touchMove(grid, touches([50, 50], [250, 250]));
    expect(block().style.height).toBe("96px");
    expect(templates(grid)[0]).toBe("3.5rem repeat(1, minmax(0, 1fr))");
  });
});
