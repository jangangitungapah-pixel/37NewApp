import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names cleanly and resolves conflicting Tailwind utility classes.
 * @param {...import('clsx').ClassValue} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
