"use client";

import type { Transition, Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface CalendarDaysIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface CalendarDaysIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DOTS = [
  "M8 14h.01", "M12 14h.01", "M16 14h.01",
  "M8 18h.01", "M12 18h.01", "M16 18h.01",
];

const DOT_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: (index: number) => ({ opacity: [1, 0.2, 1], transition: { delay: index * 0.08, duration: 0.5 } }),
};

const TRANSITION: Transition = { duration: 0.3 };

const CalendarDaysIcon = forwardRef<CalendarDaysIconHandle, CalendarDaysIconProps>(
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
        if (isControlledRef.current) onMouseEnter?.(e);
        else controls.start("animate");
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) onMouseLeave?.(e);
        else controls.start("normal");
      },
      [controls, onMouseLeave],
    );

    return (
      <div className={cn(className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width={size} xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect height="18" rx="2" width="18" x="3" y="4" />
          <path d="M3 10h18" />
          {DOTS.map((d, index) => (
            <motion.path animate={controls} custom={index} d={d} initial="normal" key={d} transition={TRANSITION} variants={DOT_VARIANTS} />
          ))}
        </svg>
      </div>
    );
  },
);

CalendarDaysIcon.displayName = "CalendarDaysIcon";

export { CalendarDaysIcon };
