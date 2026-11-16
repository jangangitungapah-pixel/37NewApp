import { motion as Motion } from 'motion/react';
import {
  fadeInVariants,
  scaleSurfaceVariants,
  slideUpVariants,
  staggerContainerVariants,
} from '../../design-system/motion/presets.js';

export function FadeIn({ children, className, ...props }) {
  return (
    <Motion.div
      variants={fadeInVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={className}
      {...props}
    >
      {children}
    </Motion.div>
  );
}

export function SlideUp({ children, className, delay = 0, ...props }) {
  return (
    <Motion.div
      variants={slideUpVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ delay }}
      className={className}
      {...props}
    >
      {children}
    </Motion.div>
  );
}

export function ScaleSurface({ children, className, ...props }) {
  return (
    <Motion.div
      variants={scaleSurfaceVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={className}
      {...props}
    >
      {children}
    </Motion.div>
  );
}

export function StaggerList({ children, className, ...props }) {
  return (
    <Motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      {...props}
    >
      {children}
    </Motion.div>
  );
}

export function StaggerItem({ children, className, ...props }) {
  return (
    <Motion.div variants={slideUpVariants} className={className} {...props}>
      {children}
    </Motion.div>
  );
}
