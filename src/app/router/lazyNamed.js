import { lazy } from 'react';

/**
 * Wraps React.lazy for named feature component exports cleanly.
 * @template T
 * @param {() => Promise<Record<string, T>>} loader
 * @param {string} exportName
 */
export function lazyNamed(loader, exportName) {
  return lazy(() =>
    loader().then((mod) => ({
      default: mod[exportName],
    })),
  );
}
