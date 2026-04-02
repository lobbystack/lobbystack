"use client";

import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface PhoneAnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PhoneAnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PhoneAnimatedIcon = forwardRef<PhoneAnimatedIconHandle, PhoneAnimatedIconProps>(
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
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(event);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(event);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave],
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
          <motion.path
            animate={controls}
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.89.33 1.76.61 2.6a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.48-1.27a2 2 0 0 1 2.11-.45c.84.28 1.71.49 2.6.61A2 2 0 0 1 22 16.92z"
            initial="normal"
            variants={{
              normal: {
                rotate: 0,
                scale: 1,
              },
              animate: {
                rotate: 0,
                scale: 1,
                transition: {
                  duration: 0.2,
                },
              },
            }}
          />
          <motion.path
            animate={controls}
            d="M15.5 4.5a5 5 0 0 1 4 4"
            initial="normal"
            variants={{
              normal: { opacity: 0, pathLength: 0 },
              animate: {
                opacity: [0, 1, 1, 0],
                pathLength: [0, 1, 1, 1],
                transition: {
                  duration: 0.65,
                  times: [0, 0.25, 0.75, 1],
                },
              },
            }}
          />
          <motion.path
            animate={controls}
            d="M15.5 1.5a8 8 0 0 1 7 7"
            initial="normal"
            variants={{
              normal: { opacity: 0, pathLength: 0 },
              animate: {
                opacity: [0, 1, 1, 0],
                pathLength: [0, 1, 1, 1],
                transition: {
                  duration: 0.65,
                  delay: 0.08,
                  times: [0, 0.25, 0.75, 1],
                },
              },
            }}
          />
        </svg>
      </div>
    );
  },
);

PhoneAnimatedIcon.displayName = "PhoneAnimatedIcon";

export { PhoneAnimatedIcon };
