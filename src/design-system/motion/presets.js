import { MOTION_TOKENS } from '../tokens/tokens.js';

export const MOTION_TRANSITIONS = Object.freeze({
  fast: {
    duration: MOTION_TOKENS.fastMs / 1000,
    ease: MOTION_TOKENS.easeStandard,
  },
  standard: {
    duration: MOTION_TOKENS.standardMs / 1000,
    ease: MOTION_TOKENS.easeStandard,
  },
  slow: {
    duration: MOTION_TOKENS.slowMs / 1000,
    ease: MOTION_TOKENS.easeStandard,
  },
  springSnappy: {
    type: 'spring',
    stiffness: 420,
    damping: 34,
    mass: 0.7,
  },
});

export const fadeInVariants = Object.freeze({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: MOTION_TRANSITIONS.standard },
  exit: { opacity: 0, transition: MOTION_TRANSITIONS.fast },
});

export const slideUpVariants = Object.freeze({
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: MOTION_TRANSITIONS.standard },
  exit: { opacity: 0, y: 6, transition: MOTION_TRANSITIONS.fast },
});

export const scaleSurfaceVariants = Object.freeze({
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: MOTION_TRANSITIONS.springSnappy },
  exit: { opacity: 0, scale: 0.98, transition: MOTION_TRANSITIONS.fast },
});

export const staggerContainerVariants = Object.freeze({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
});
