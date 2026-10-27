"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface IdCardIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface IdCardIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const PERSON_VARIANTS: Variants = {
  normal: { y: 0, transition: { type: "spring", stiffness: 200, damping: 13 } },
  animate: { y: [0, -1.5, 0], transition: { duration: 0.4, ease: "easeInOut" } },
};

const LINE_VARIANTS: Variants = {
  normal: { x: 0, transition: { duration: 0.2 } },
  animate: (index: number) => ({ x: [0, 1.5, 0], transition: { delay: 0.1 + index * 0.12, duration: 0.3, ease: "easeOut" } }),
};

const IdCardIcon = forwardRef<IdCardIconHandle, IdCardIconProps>(
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
          <rect height="14" rx="2" width="20" x="2" y="5" />
          <motion.g animate={controls} variants={PERSON_VARIANTS}>
            <path d="M6.17 15a3 3 0 0 1 5.66 0" />
            <circle cx="9" cy="11" r="2" />
          </motion.g>
          <motion.path animate={controls} custom={0} d="M16 10h2" variants={LINE_VARIANTS} />
          <motion.path animate={controls} custom={1} d="M16 14h2" variants={LINE_VARIANTS} />
        </svg>
      </div>
    );
  }
);

IdCardIcon.displayName = "IdCardIcon";

export { IdCardIcon };
