import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor, hexToRgba } from '../utils/colors';

/**
 * Theme-aware version of the active company's brand color.
 *
 * Returns:
 *   - `base`   — the raw `primary_color` (use this when you genuinely need
 *                the brand color regardless of theme, e.g. when capturing a
 *                document for PDF).
 *   - `accent` — the same color in light mode, brightened in dark mode if
 *                it's too dark to read against gray-800/900 surfaces. Use
 *                this for text/icons/borders/buttons in the app chrome.
 *   - `tint(alpha)` — `rgba` of the raw brand color at the given alpha,
 *                useful for soft halos, hover backgrounds, etc.
 *   - `isDark` — convenience flag for callers that also want to switch a
 *                neighboring color (e.g. text on a button).
 */
export function useBrandAccent() {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const base = selectedCompany?.primary_color || '#4f46e5';
  const accent = brandColorFor(base, isDark);
  return {
    base,
    accent,
    isDark,
    tint: (alpha: number) => hexToRgba(base, alpha),
  };
}
