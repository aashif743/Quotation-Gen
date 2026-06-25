/**
 * Color utilities for handling per-company brand colors that have to work on
 * both light and dark app surfaces.
 *
 * Each company has a `primary_color` admins configure in Settings. In light
 * mode any saturated brand color (#dc2626 red, #16a34a green, #4f46e5
 * indigo, …) reads fine. In dark mode the very dark brand colors (navy,
 * deep maroon, near-black) lose contrast against the gray-800 / gray-900
 * dark surfaces. `brandColorFor()` lightens those just enough to stay
 * legible while leaving already-bright brand colors alone — so the company
 * identity is preserved.
 */

export interface Rgb { r: number; g: number; b: number; }

const FALLBACK: Rgb = { r: 79, g: 70, b: 229 }; // tailwind indigo-600

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return FALLBACK;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Relative luminance per WCAG: 0 = pure black, 1 = pure white.
 * Used to decide whether a brand color needs brightening for dark mode.
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * Blend a hex color toward white by `amount` ∈ [0,1].
 * 0 returns the color unchanged; 1 returns pure white.
 */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const blend = (v: number) => v + (255 - v) * amount;
  return rgbToHex(blend(r), blend(g), blend(b));
}

/**
 * Theme-aware brand color: returns the original color in light mode, and a
 * brightened version in dark mode if the color is too dark to read on a
 * `gray-800` / `gray-900` surface. Already-bright brand colors are left
 * alone so the company identity is preserved.
 */
export function brandColorFor(hex: string, isDark: boolean): string {
  if (!isDark) return hex;
  const lum = relativeLuminance(hex);
  if (lum >= 0.4) return hex; // already bright, fine on a dark surface
  // Scale boost so very dark colors get more lift than mid-tone ones.
  const boost = lum < 0.12 ? 0.6 : lum < 0.2 ? 0.5 : lum < 0.3 ? 0.4 : 0.3;
  return lighten(hex, boost);
}

/**
 * Tint alpha for soft brand-color backgrounds (active nav-item background,
 * stat-card icon halo, etc.). Dark mode needs a noticeably higher alpha to
 * stay visible against a dark surface.
 */
export function brandTintAlpha(base: number, isDark: boolean): number {
  return isDark ? Math.min(0.45, base + 0.1) : base;
}
