import { cn } from "@/lib/utils";

type MainProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean;
  fluid?: boolean;
};

export function Main({ className, fixed, fluid, ...props }: MainProps) {
  return (
    <main
      className={cn(
        "px-4 py-6 md:px-6",
        fixed && "flex grow flex-col overflow-hidden",
        !fluid && "mx-auto w-full max-w-7xl",
        className,
      )}
      data-layout={fixed ? "fixed" : "auto"}
      {...props}
    />
  );
}
