"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface WorkflowIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface WorkflowIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

// The two boxes pull apart along the connector and settle back, without hiding any part of the icon.
const VARIANTS: Variants = {
  normal: {
    x: 0,
    y: 0,
    transition: { type: "spring", stiffness: 200, damping: 13 },
  },
  animate: (direction: number) => ({
    x: [0, -2 * direction, 0],
    y: [0, -2 * direction, 0],
    transition: { duration: 0.5, ease: "easeInOut" },
  }),
};

const WorkflowIcon = forwardRef<WorkflowIconHandle, WorkflowIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
            custom={1}
            height="8"
            rx="2"
            variants={VARIANTS}
            width="8"
            x="3"
            y="3"
          />
          <path d="M7 11v4a2 2 0 0 0 2 2h4" />
          <motion.rect
            animate={controls}
            custom={-1}
            height="8"
            rx="2"
            variants={VARIANTS}
            width="8"
            x="13"
            y="13"
          />
        </svg>
      </div>
    );
  }
);

WorkflowIcon.displayName = "WorkflowIcon";

export { WorkflowIcon };
