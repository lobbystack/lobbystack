"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface PaletteIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PaletteIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DASH_LENGTH = 70;
const DOT_STAGGER = 0.08;

const DOTS = [
  { cx: 6.5, cy: 12.5 },
  { cx: 8.5, cy: 7.5 },
  { cx: 13.5, cy: 6.5 },
  { cx: 17.5, cy: 10.5 },
];

const OUTLINE_VARIANTS: Variants = {
  normal: {
    strokeDashoffset: 0,
  },
  // The outline stays drawn; only the paint dots pulse.
  animate: {
    strokeDashoffset: 0,
  },
};

const DOTS_GROUP_VARIANTS: Variants = {
  normal: {},
  animate: {
    transition: {
      delayChildren: 0,
      staggerChildren: DOT_STAGGER,
    },
  },
};

const DOT_VARIANTS: Variants = {
  normal: {
    scale: 1,
    transition: { duration: 0.2 },
  },
  animate: {
    scale: [1, 1.6, 1],
    transition: { duration: 0.35, ease: "easeInOut" },
  },
};

const PaletteIcon = forwardRef<PaletteIconHandle, PaletteIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);
    const isAnimatingRef = useRef(false);

    const startAnimation = useCallback(async () => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      try {
        await controls.start("animate");
      } finally {
        isAnimatingRef.current = false;
      }
    }, [controls]);

    const stopAnimation = useCallback(async () => {
      isAnimatingRef.current = false;
      await controls.start("normal");
    }, [controls]);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return { startAnimation, stopAnimation };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          startAnimation();
        }
      },
      [startAnimation, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          stopAnimation();
        }
      },
      [stopAnimation, onMouseLeave]
    );

    return (
      <div
        className={cn("inline-flex items-center justify-center", className)}
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
            d="M12 2a1 1 0 0 0 0 20l.25 0a1.75 1.75 0 0 0 1.4-2.8l-.3-.4a1.75 1.75 0 0 1 1.4-2.8h2.25a5 5 0 0 0 5-5 10 9 0 0 0-10-9z"
            initial="normal"
            strokeDasharray={DASH_LENGTH}
            variants={OUTLINE_VARIANTS}
          />
          <motion.g
            animate={controls}
            initial="normal"
            variants={DOTS_GROUP_VARIANTS}
          >
            {DOTS.map((dot) => (
              <motion.circle
                cx={dot.cx}
                cy={dot.cy}
                fill="currentColor"
                key={`${dot.cx}-${dot.cy}`}
                r=".5"
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
                variants={DOT_VARIANTS}
              />
            ))}
          </motion.g>
        </svg>
      </div>
    );
  }
);

PaletteIcon.displayName = "PaletteIcon";

export { PaletteIcon };
