"use client";
import { motion, useInView } from "framer-motion";
import { useRef, type ReactNode } from "react";
interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
}
const directionMap = {
  up:    { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } },
  down:  { initial: { opacity: 0, y: -24 }, animate: { opacity: 1, y: 0 } },
  left:  { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 } },
  right: { initial: { opacity: 0, x: -24 }, animate: { opacity: 1, x: 0 } },
  none:  { initial: { opacity: 0 }, animate: { opacity: 1 } },
};
export function Reveal({
  children,
  className,
  delay = 0,
  direction = "up",
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const { initial, animate } = directionMap[direction];
  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={isInView ? animate : initial}
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 28,
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
