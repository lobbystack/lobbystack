"use client";

import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface LayoutPanelTopIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LayoutPanelTopIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const LayoutPanelTopIcon = forwardRef<
  LayoutPanelTopIconHandle,
  LayoutPanelTopIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;

    return {
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    };
  });

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseEnter?.(e);
      } else {
        controls.start("animate");
      }
    },
    [controls, onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(e);
      } else {
        controls.start("normal");
      }
    },
    [controls, onMouseLeave]
  );

  return (
    <div
      className={cn(className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <svg
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <motion.rect
          animate={controls}
          height="7"
          initial="normal"
          rx="1"
          variants={{
            normal: { translateY: 0 },
            animate: {
              translateY: [0, -2, 0],
              transition: { duration: 0.4, ease: "easeInOut" },
            },
          }}
          width="18"
          x="3"
          y="3"
        />
        <motion.rect
          animate={controls}
          height="7"
          initial="normal"
          rx="1"
          variants={{
            normal: { translateX: 0 },
            animate: {
              translateX: [0, -2, 0],
              transition: { delay: 0.15, duration: 0.4, ease: "easeInOut" },
            },
          }}
          width="7"
          x="3"
          y="14"
        />
        <motion.rect
          animate={controls}
          height="7"
          initial="normal"
          rx="1"
          variants={{
            normal: { translateX: 0 },
            animate: {
              translateX: [0, 2, 0],
              transition: { delay: 0.15, duration: 0.4, ease: "easeInOut" },
            },
          }}
          width="7"
          x="14"
          y="14"
        />
      </svg>
    </div>
  );
});

LayoutPanelTopIcon.displayName = "LayoutPanelTopIcon";

export { LayoutPanelTopIcon };
