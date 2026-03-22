import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

type AsChildProp = {
  asChild?: boolean;
};

function resolveRenderProp(
  asChild: boolean | undefined,
  children: React.ReactNode,
): {
  children?: React.ReactNode | undefined;
  render?: React.ReactElement | undefined;
} {
  if (!asChild) {
    return { children, render: undefined };
  }

  const child = React.Children.only(children) as React.ReactElement;
  return { children: undefined, render: child };
}

function Collapsible({
  asChild,
  children,
  ...props
}: CollapsiblePrimitive.Root.Props & AsChildProp) {
  const renderProps = resolveRenderProp(asChild, children);

  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      {...props}
      {...renderProps}
    />
  );
}

function CollapsibleTrigger({
  asChild,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props & AsChildProp) {
  const renderProps = resolveRenderProp(asChild, children);

  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      {...props}
      {...renderProps}
    />
  );
}

function CollapsibleContent({
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
