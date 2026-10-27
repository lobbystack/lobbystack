"use client";

import { useEffect, useRef, type ForwardRefExoticComponent, type HTMLAttributes, type RefAttributes } from "react";

type AnimatedIconHandle = { startAnimation: () => void; stopAnimation: () => void };

/** A lucide-animated icon, which plays while its sidebar item is hovered or focused. */
export type AnimatedIcon = ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & { size?: number } & RefAttributes<AnimatedIconHandle>>;

export function AnimatedNavigationIcon({ icon: Icon, hovered }: { icon: AnimatedIcon; hovered: boolean }) {
  const iconRef = useRef<AnimatedIconHandle | null>(null);
  const wasHovered = useRef(false);
  useEffect(() => {
    if (hovered) iconRef.current?.startAnimation();
    // An icon that never animated is already at rest, and has no opacity yet to animate back from.
    else if (wasHovered.current) iconRef.current?.stopAnimation();
    wasHovered.current = hovered;
  }, [hovered]);
  return <Icon ref={iconRef} className="size-4 shrink-0 [&_svg]:size-4" size={16} />;
}
