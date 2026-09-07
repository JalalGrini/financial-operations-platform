/**
 * EFOP Motion System V3
 * Enter easing: [0.22, 1, 0.36, 1]  — snappy decelerate (fast start → smooth settle)
 * Exit  easing: [0.4,  0, 1, 1]     — sharp accelerate (quick leave)
 * Mid   easing: [0.4,  0, 0.2, 1]   — balanced (dialogs, dropdowns)
 */

export const easeEnter = [0.22, 1, 0.36, 1] as const;
export const easeExit  = [0.4,  0, 1,    1] as const;
export const easeMid   = [0.4,  0, 0.2,  1] as const;

export const motionFast = {
  initial:    { opacity: 0, y: 4 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -4 },
  transition: { duration: 0.15, ease: easeEnter },
};

export const motionMed = {
  initial:    { opacity: 0, y: 8 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -6 },
  transition: { duration: 0.25, ease: easeEnter },
};

export const motionSlow = {
  initial:    { opacity: 0, y: 16 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -10 },
  transition: { duration: 0.35, ease: easeEnter },
};

export const fadeIn = {
  initial:    { opacity: 0 },
  animate:    { opacity: 1 },
  exit:       { opacity: 0 },
  transition: { duration: 0.2, ease: easeEnter },
};

export const fadeInDown = {
  initial:    { opacity: 0, y: -8 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: easeEnter },
};

export const slideInFromLeft = {
  initial:    { opacity: 0, x: -16 },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0, x: -16 },
  transition: { duration: 0.28, ease: easeEnter },
};

export const scaleIn = {
  initial:    { opacity: 0, scale: 0.95 },
  animate:    { opacity: 1, scale: 1 },
  exit:       { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2, ease: easeEnter },
};

export const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easeEnter } },
};
