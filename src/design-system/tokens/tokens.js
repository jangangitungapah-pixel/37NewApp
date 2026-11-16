/**
 * Canonical design system token registry for 37MusicStudio UI Foundation 2026.
 * Mirrors semantic CSS custom properties defined in `src/styles/themes.css`.
 */

export const DESIGN_SYSTEM_META = Object.freeze({
  name: '37MusicStudio Design System 2026',
  visualDirection: 'Premium Minimal SaaS + Spatial Interface',
  colorSpace: 'OKLCH',
});

export const TYPOGRAPHY_TOKENS = Object.freeze({
  fontSans: "'Geist Sans', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  scale: Object.freeze({
    xs: { size: '0.75rem', lineHeight: '1rem' },
    sm: { size: '0.8125rem', lineHeight: '1.25rem' },
    base: { size: '0.9375rem', lineHeight: '1.5rem' },
    lg: { size: '1.125rem', lineHeight: '1.65rem' },
    xl: { size: '1.375rem', lineHeight: '1.85rem' },
    '2xl': { size: '1.625rem', lineHeight: '2.05rem' },
  }),
});

export const SPACING_TOKENS = Object.freeze({
  pagePaddingDesktop: '24px',
  pagePaddingMobile: '14px',
  panelPadding: '20px',
  cardGap: '16px',
  controlMinHeight: '40px',
});

export const RADIUS_TOKENS = Object.freeze({
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  full: 'var(--radius-full)',
});

export const SURFACE_TOKENS = Object.freeze({
  standard: 'var(--surface-standard)',
  elevated: 'var(--surface-elevated)',
  floating: 'var(--surface-floating)',
  glass: 'var(--surface-glass)',
  interactive: 'var(--surface-interactive)',
});

export const MOTION_TOKENS = Object.freeze({
  fastMs: 140,
  standardMs: 220,
  slowMs: 360,
  easeStandard: [0.22, 1, 0.36, 1],
});

/**
 * Resolves live computed CSS token strings cleanly for non-DOM engines (e.g. ECharts canvas renderer).
 * Falls back safely to deterministic OKLCH/sRGB strings in SSR or test DOMs.
 */
export function readCssTokenValue(cssVarName, fallback = '') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
  return value || fallback;
}
