import * as React from "react"
import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { useScrollRowRef } from "@/components/ui/scroll-row"
import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  // A horizontal row scrolls sideways when it doesn't fit (see scroll-row in theme.css), so tabs are cut off at the content edge instead of running past it.
  "group/tabs-list flex w-fit items-center justify-start rounded-full p-1 group-data-horizontal/tabs:scroll-row text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        // Polar's SegmentedControl: a round track with round segments, the active one raised.
        default: "gap-1 bg-muted",
        line: "gap-1 bg-transparent",
        pills: "gap-2 bg-transparent p-0 group-data-horizontal/tabs:h-auto group-data-horizontal/tabs:scroll-row-bleed",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  ref,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const rowRef = useScrollRowRef<HTMLDivElement>(ref)
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      ref={rowRef}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(tabsTriggerClassName, className)}
      {...props}
    />
  )
}

/** Every look a trigger takes, keyed off its list's variant and its own data-active. The segmented control's items share it. */
const tabsTriggerClassName = cn(
  "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-1 type-title whitespace-nowrap text-foreground/60 transition-all group-data-[variant=default]/tabs-list:h-full group-data-[variant=default]/tabs-list:py-1.5 group-data-[variant=default]/tabs-list:type-label group-data-[variant=default]/tabs-list:text-muted-foreground group-data-[variant=default]/tabs-list:data-active:shadow-lg group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
  "group-data-[variant=pills]/tabs-list:h-9 group-data-[variant=pills]/tabs-list:flex-none group-data-[variant=pills]/tabs-list:rounded-full group-data-[variant=pills]/tabs-list:px-4 group-data-[variant=pills]/tabs-list:py-0 group-data-[variant=pills]/tabs-list:text-muted-foreground group-data-[variant=pills]/tabs-list:hover:bg-muted/70 group-data-[variant=pills]/tabs-list:hover:text-foreground group-data-[variant=pills]/tabs-list:data-active:border-transparent group-data-[variant=pills]/tabs-list:data-active:bg-muted group-data-[variant=pills]/tabs-list:data-active:text-foreground dark:group-data-[variant=pills]/tabs-list:data-active:border-transparent dark:group-data-[variant=pills]/tabs-list:data-active:bg-muted",
  "data-active:bg-background data-active:text-foreground data-active:shadow-xs dark:data-active:bg-input dark:data-active:text-foreground",
  "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
)

const SegmentedControlValue = React.createContext<unknown>(undefined)

/**
 * The tabs' segmented look for picking one of a few values, with a radio
 * group's semantics: Tab enters at the chosen item, the arrow keys move and
 * select, and screen readers announce a radio group. Label it with
 * aria-label or aria-labelledby.
 */
function SegmentedControl<Value>({ className, ref, value, ...props }: RadioGroup.Props<Value>) {
  const rowRef = useScrollRowRef<HTMLDivElement>(ref)
  return (
    <SegmentedControlValue.Provider value={value}>
      <RadioGroup
        data-slot="segmented-control"
        data-variant="default"
        className={cn(tabsListVariants({ variant: "default" }), "scroll-row w-full", className)}
        ref={rowRef}
        value={value}
        {...props}
      />
    </SegmentedControlValue.Provider>
  )
}

/** One choice in a SegmentedControl, drawn as a tab trigger and raised while chosen. Long labels wrap. */
function SegmentedControlItem<Value>({ className, value, ...props }: Radio.Root.Props<Value>) {
  const chosen = React.useContext(SegmentedControlValue) === value
  return (
    <Radio.Root
      data-slot="segmented-control-item"
      data-active={chosen ? "" : undefined}
      className={cn(tabsTriggerClassName, "min-h-8 cursor-pointer text-center leading-tight whitespace-normal", className)}
      value={value}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("type-body flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { SegmentedControl, SegmentedControlItem, Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
