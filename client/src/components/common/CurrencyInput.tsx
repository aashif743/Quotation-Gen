import React, { forwardRef, useEffect, useRef, useState } from 'react';

/**
 * Input for money values. Shows the value with thousand-separator commas
 * (e.g. "1,250,000") and drops trailing zeros after the decimal point
 * (1000 → "1,000", 1000.5 → "1,000.5", 1000.55 → "1,000.55").
 *
 * It renders as `type="text"` (with `inputMode="decimal"` so mobile keypads
 * still show the numeric keyboard) because `type="number"` doesn't allow
 * formatted display.
 */

interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
}

// Insert a comma every 3 digits from the right in the integer part.
const addThousandsCommas = (intStr: string): string =>
  intStr ? intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';

// Canonical display for the stored numeric value: trim trailing zeros after
// the decimal, drop the decimal point entirely if integer, and add commas.
const formatForDisplay = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return '';
  const fixed = Math.abs(n).toFixed(10);
  const [intPart, decRaw] = fixed.split('.');
  const dec = (decRaw || '').replace(/0+$/, '');
  const sign = n < 0 ? '-' : '';
  return sign + addThousandsCommas(intPart) + (dec ? '.' + dec : '');
};

// Format the in-progress string the user is typing. Strips invalid chars,
// allows a single decimal point, commafies the integer part, but preserves
// whatever digits they've typed after the decimal so the cursor doesn't fight
// them while they're typing "1000.50".
const formatWhileTyping = (raw: string): string => {
  if (!raw) return '';
  // Keep only digits and a decimal point.
  let cleaned = raw.replace(/[^0-9.]/g, '');
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx !== -1) {
    // Strip any extra decimal points after the first.
    cleaned = cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, '');
  }
  const [intPart, decPart] = cleaned.split('.');
  const withCommas = addThousandsCommas(intPart);
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
};

const parseDisplay = (s: string): number => {
  if (!s) return 0;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, placeholder = '0.00', className, onFocus, onBlur, ...rest }, ref) => {
    const numericValue = Number(value || 0);
    const [display, setDisplay] = useState<string>(() => formatForDisplay(numericValue));
    const focusedRef = useRef(false);

    // Re-sync from the parent only when we're not actively editing — otherwise
    // we'd fight the user's keystrokes.
    useEffect(() => {
      if (!focusedRef.current) {
        setDisplay(formatForDisplay(numericValue));
      }
    }, [numericValue]);

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}
        className={className}
        onFocus={(e) => {
          focusedRef.current = true;
          onFocus?.(e);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          // Snap back to the canonical form on blur so e.g. "1,000." → "1,000".
          setDisplay(formatForDisplay(numericValue));
          onBlur?.(e);
        }}
        onChange={(e) => {
          const formatted = formatWhileTyping(e.target.value);
          setDisplay(formatted);
          onChange(parseDisplay(formatted));
        }}
        {...rest}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';

export default CurrencyInput;
