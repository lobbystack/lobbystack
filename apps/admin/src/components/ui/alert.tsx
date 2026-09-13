import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative grid w-full gap-1 rounded-xl border px-4 py-3 text-sm", {
  variants: { variant: {
    default: "bg-card text-card-foreground",
    destructive: "bg-card text-destructive [&_[data-slot=alert-description]]:text-destructive/90",
  } },
  defaultVariants: { variant: "default" },
});

export function Alert({ className, variant, ...props }: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
