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
 * Blend a hex color toward white by `amount` ∈ [0,1]. Note: this washes
 * the color toward pastel. Prefer `brandColorFor` for dark-mode contrast
 * because it bumps HSL lightness without losing saturation.
 */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const blend = (v: number) => v + (255 - v) * amount;
  return rgbToHex(blend(r), blend(g), blend(b));
}

// ----------------------- HSL conversion helpers -----------------------------

function rgb01ToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2;               break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb01(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3),
  };
}

/**
 * Theme-aware brand color.
 *
 * In light mode the color is returned unchanged.
 *
 * In dark mode, the color's HSL lightness is gently lifted toward ~0.55 if
 * it sits below that — just enough to read against a `gray-800` / `gray-900`
 * surface. The hue and saturation are preserved (and we even nudge
 * saturation up a touch to compensate for the slight perceived fade),
 * so a dark navy stays clearly navy instead of going pastel lavender,
 * a dark red stays red instead of pink, and an already-bright brand color
 * (red, green, indigo) is left alone.
 */
export function brandColorFor(hex: string, isDark: boolean): string {
  if (!isDark) return hex;
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgb01ToHsl(r / 255, g / 255, b / 255);
  // Anything lighter than ~0.55 already reads fine on a dark surface.
  if (l >= 0.5) return hex;
  // Lift lightness toward a target around 0.55. We add at most 0.18 so the
  // shift is subtle for mid-tones and stronger for very dark colors.
  const targetL = Math.min(0.6, l + 0.18);
  // Saturation is preserved (and very slightly boosted) so the color
  // identity comes through clearly.
  const newS = Math.min(1, s * 1.05);
  const { r: rN, g: gN, b: bN } = hslToRgb01(h, newS, targetL);
  return rgbToHex(rN * 255, gN * 255, bN * 255);
}

/**
 * Tint alpha for soft brand-color backgrounds (active nav-item background,
 * stat-card icon halo, etc.). Dark mode needs a noticeably higher alpha to
 * stay visible against a dark surface.
 */
export function brandTintAlpha(base: number, isDark: boolean): number {
  return isDark ? Math.min(0.45, base + 0.1) : base;
}
