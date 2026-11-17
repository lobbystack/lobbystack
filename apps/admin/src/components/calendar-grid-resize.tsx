"use client";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The handles are focusable separators, the window splitter pattern: they take pointer drags and arrow keys. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

import { HOUR_HEIGHT } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

/** The hour column's width in pixels (3.5rem). */
export const TIME_GUTTER = 56;
export const MIN_HOUR_HEIGHT = 28;
export const MAX_HOUR_HEIGHT = 160;
export const MIN_COLUMN_WIDTH = 56;
export const MAX_COLUMN_WIDTH = 640;
const ROW_KEY_STEP = 8;
const COLUMN_KEY_STEP = 16;
/** Fingers closer than this on an axis scale both axes together, since a tiny gap makes a wild ratio. */
const PINCH_AXIS_MIN = 40;

const NO_WIDTHS: Array<number | null> = [];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Where the grid was scrolled when a resize began, so the time or day under the pointer stays put. */
type Anchor = { top: number; left: number; hour: number; x: number; y: number };

export type GridSize = {
  /** Pixels one hour takes. */
  hourHeight: number;
  /** Pixels each day column takes, or null while it shares the free space. */
  widths: Array<number | null>;
  anchor: (x?: number, y?: number) => Anchor;
  setHourHeight: (next: number, anchor?: Anchor) => void;
  setColumnWidth: (index: number, width: number | null) => void;
  resetHourHeight: () => void;
};

/**
 * How big the time grid draws: the height of an hour and the width of each day.
 * Rows resize together, since every hour is the same length. Columns resize one
 * at a time, and a column with no width of its own shares what the others leave.
 * Two fingers on the grid scale both: the spread between them sets the width
 * and height ratios, and the grid keeps the spot between the fingers in place.
 */
export function useGridSize(scroller: RefObject<HTMLDivElement | null>, columnCount: number): GridSize {
  const [hourHeight, setHourHeightState] = useState(HOUR_HEIGHT);
  // Widths belong to the number of columns they were set for, so switching between day and week starts fresh.
  const [sized, setSized] = useState<{ count: number; widths: Array<number | null> }>({ count: columnCount, widths: [] });
  const widths = sized.count === columnCount ? sized.widths : NO_WIDTHS;
  const hourRef = useRef(HOUR_HEIGHT);
  const pending = useRef<{ top?: number; left?: number }>({});

  // The scroll position the new size needs is applied once the grid has the size.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (pending.current.top !== undefined) element.scrollTop = pending.current.top;
    if (pending.current.left !== undefined) element.scrollLeft = pending.current.left;
    pending.current = {};
  }, [hourHeight, widths, scroller]);

  const anchor = useCallback((x = 0, y = 0): Anchor => ({ top: scroller.current?.scrollTop ?? 0, left: scroller.current?.scrollLeft ?? 0, hour: hourRef.current, x, y }), [scroller]);

  const setHourHeight = useCallback((next: number, from?: Anchor) => {
    const value = clamp(Math.round(next * 10) / 10, MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT);
    if (from) pending.current.top = Math.max(0, ((from.top + from.y) * value) / from.hour - from.y);
    hourRef.current = value;
    setHourHeightState(value);
  }, []);

  const setColumnWidth = useCallback((index: number, width: number | null) => {
    setSized((current) => {
      const list = current.count === columnCount ? [...current.widths] : [];
      while (list.length < columnCount) list.push(null);
      list[index] = width === null ? null : clamp(Math.round(width), MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
      return { count: columnCount, widths: list.every((entry) => entry === null) ? [] : list };
    });
  }, [columnCount]);

  const resetHourHeight = useCallback(() => setHourHeight(HOUR_HEIGHT), [setHourHeight]);

  // Pinching on a phone. The listeners are native and not passive: React's touch handlers can't stop the page from zooming.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    type Pinch = { dx: number; dy: number; distance: number; hour: number; widths: number[]; anchor: Anchor; fill: number };
    let pinch: Pinch | null = null;
    const spread = (touches: TouchList) => {
      const [first, second] = [touches[0]!, touches[1]!];
      const dx = Math.abs(first.clientX - second.clientX);
      const dy = Math.abs(first.clientY - second.clientY);
      return { dx, dy, distance: Math.hypot(dx, dy), x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 };
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) { pinch = null; return; }
      const fingers = spread(event.touches);
      const bounds = element.getBoundingClientRect();
      const columns = [...element.querySelectorAll<HTMLElement>("[data-column-header]")].map((header) => header.getBoundingClientRect().width);
      pinch = { ...fingers, hour: hourRef.current, widths: columns, anchor: anchor(fingers.x - bounds.left, fingers.y - bounds.top), fill: columns.length ? (element.clientWidth - TIME_GUTTER) / columns.length : 0 };
    };
    const onMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const fingers = spread(event.touches);
      const uniform = pinch.distance > 0 ? fingers.distance / pinch.distance : 1;
      const ratioX = pinch.dx >= PINCH_AXIS_MIN ? fingers.dx / pinch.dx : uniform;
      const ratioY = pinch.dy >= PINCH_AXIS_MIN ? fingers.dy / pinch.dy : uniform;
      setHourHeight(pinch.hour * ratioY, pinch.anchor);
      if (pinch.widths.length > 1) {
        // Zooming out stops where the days fill the screen, so it never leaves an empty strip.
        const least = Math.max(MIN_COLUMN_WIDTH, pinch.fill);
        const next = pinch.widths.map((width) => clamp(width * ratioX, least, MAX_COLUMN_WIDTH));
        pending.current.left = Math.max(0, ((pinch.anchor.left + pinch.anchor.x) * ratioX) - pinch.anchor.x);
        setSized({ count: pinch.widths.length, widths: next });
      }
    };
    const onEnd = (event: TouchEvent) => { if (event.touches.length < 2) pinch = null; };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("touchcancel", onEnd);
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onEnd);
    };
  }, [anchor, scroller, setHourHeight]);

  return { hourHeight, widths, anchor, setHourHeight, setColumnWidth, resetHourHeight };
}

const lineIndicator = "after:absolute after:bg-transparent hover:after:bg-ring focus-visible:after:bg-ring";

/** The edge of a day's header, which drags the day's column wider or narrower. */
export function ColumnResizeHandle({ index, label, size }: { index: number; label: string; size: GridSize }) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const rtl = typeof document !== "undefined" && document.dir === "rtl";
  const widthOf = (handle: HTMLElement) => handle.parentElement?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH;
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    size.setColumnWidth(index, drag.current.width + (event.clientX - drag.current.x) * (rtl ? -1 : 1));
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    size.setColumnWidth(index, (size.widths[index] ?? widthOf(event.currentTarget)) + direction * (rtl ? -1 : 1) * COLUMN_KEY_STEP);
  };
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={MAX_COLUMN_WIDTH}
      aria-valuemin={MIN_COLUMN_WIDTH}
      {...(size.widths[index] != null ? { "aria-valuenow": size.widths[index] } : {})}
      className={cn("absolute inset-y-0 -end-1 z-50 w-2 cursor-col-resize touch-none outline-none after:inset-y-1 after:start-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full", lineIndicator)}
      data-testid="calendar-column-handle"
      onDoubleClick={() => size.setColumnWidth(index, null)}
      onKeyDown={onKeyDown}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerCancel={finish}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { x: event.clientX, width: widthOf(event.currentTarget) };
      }}
      onPointerMove={resize}
      onPointerUp={finish}
      role="separator"
      tabIndex={0}
    />
  );
}

/**
 * The line between two hours in the hour column, which drags every row taller or
 * shorter. It follows the pointer: the line `boundary` hours down moves as far as
 * the pointer does, so each hour takes a share of that.
 */
export function RowResizeHandle({ boundary, label, size, top }: { boundary: number; label: string; size: GridSize; top: number }) {
  const drag = useRef<{ y: number; hour: number; anchor: ReturnType<GridSize["anchor"]> } | null>(null);
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return (
    <div
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemax={MAX_HOUR_HEIGHT}
      aria-valuemin={MIN_HOUR_HEIGHT}
      aria-valuenow={Math.round(size.hourHeight)}
      className={cn("absolute inset-x-0 z-10 h-2 -translate-y-1/2 cursor-row-resize touch-none outline-none after:inset-x-1 after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:rounded-full", lineIndicator)}
      data-testid="calendar-row-handle"
      onDoubleClick={size.resetHourHeight}
      onKeyDown={(event) => {
        const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        if (!direction) return;
        event.preventDefault();
        size.setHourHeight(size.hourHeight + direction * ROW_KEY_STEP, size.anchor());
      }}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerCancel={finish}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { y: event.clientY, hour: size.hourHeight, anchor: size.anchor() };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        size.setHourHeight(drag.current.hour + (event.clientY - drag.current.y) / boundary, drag.current.anchor);
      }}
      onPointerUp={finish}
      role="separator"
      // Only the first line is a tab stop: they all do the same thing.
      style={{ top }}
      tabIndex={boundary === 1 ? 0 : -1}
    />
  );
}
