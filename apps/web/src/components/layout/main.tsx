import { cn } from "@/lib/utils";

type MainProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean;
  fluid?: boolean;
};

export function Main({ className, fixed, fluid, ...props }: MainProps) {
  return (
    <main
      className={cn(
        "px-4 pt-4 pb-6 md:px-6 md:pt-12 md:pb-6",
        !fixed && "after:block after:h-10 after:shrink-0 after:content-[''] md:after:h-12",
        fixed && "flex min-h-0 grow flex-col overflow-hidden",
        !fluid && "mx-auto w-full max-w-7xl",
        className,
      )}
      data-layout={fixed ? "fixed" : "auto"}
      {...props}
    />
  );
}
