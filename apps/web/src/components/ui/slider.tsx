"use client";

import React from "react";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

type SliderValue = number | readonly number[];

interface SliderProps
  extends SliderPrimitive.Root.Props<SliderValue> {
  bufferValue?: number;
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  bufferValue,
  ...props
}: SliderProps) {
  const values = React.useMemo(() => {
    if (typeof value === "number") {
      return [value];
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof defaultValue === "number") {
      return [defaultValue];
    }
    if (Array.isArray(defaultValue)) {
      return defaultValue;
    }
    return [min];
  }, [value, defaultValue, min, max]);

  const controlledProps = value === undefined ? {} : { value };
  const defaultProps = defaultValue === undefined ? {} : { defaultValue };
  const normalizedBufferValue =
    bufferValue === undefined ? undefined : Math.min(Math.max(bufferValue, min), max);
  const bufferPercent =
    normalizedBufferValue === undefined || max === min
      ? undefined
      : ((normalizedBufferValue - min) / (max - min)) * 100;

  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-disabled:opacity-50",
        className
      )}
      data-slot="slider"
      max={max}
      min={min}
      {...defaultProps}
      {...controlledProps}
      {...props}
    >
      <SliderPrimitive.Control
        className={cn(
          "relative grow touch-none select-none data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-1.5"
        )}
        data-slot="slider-control"
      >
        <SliderPrimitive.Track
          className={cn(
            "relative grow rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-full"
          )}
          data-slot="slider-track"
        >
          {bufferPercent !== undefined ? (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-0 bg-primary/40 data-[orientation=vertical]:inset-x-0 data-[orientation=vertical]:bottom-0 data-[orientation=vertical]:top-auto"
              data-orientation={props.orientation ?? "horizontal"}
              data-slot="buffer-indicator"
              style={
                (props.orientation ?? "horizontal") === "vertical"
                  ? { height: `${bufferPercent}%` }
                  : { width: `${bufferPercent}%` }
              }
            />
          ) : null}
          <SliderPrimitive.Indicator
            className={cn(
              "absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:bottom-0 data-[orientation=vertical]:w-full"
            )}
            data-slot="slider-range"
          />
          {values.map((_, index) => (
            <SliderPrimitive.Thumb
              className="z-10 block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:outline-hidden focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50"
              data-slot="slider-thumb"
              index={index}
              key={String(index)}
            />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
export { Slider };
