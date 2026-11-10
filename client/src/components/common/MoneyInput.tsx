import React from 'react';
import CurrencyInput from './CurrencyInput';
import { getActiveCurrency } from '../../utils/calculations';

interface Props {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  currency?: string | null;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/**
 * Money amount field: thousands separators while typing (1,250,000), the
 * currency shown inside the box, right-aligned figures, no spinner arrows.
 */
const MoneyInput: React.FC<Props> = ({ value, onChange, currency, placeholder = '0.00', className = '', ...rest }) => {
  const cur = currency || getActiveCurrency();
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">{cur}</span>
      <CurrencyInput
        value={value === '' || value == null ? 0 : Number(String(value).replace(/,/g, '')) || 0}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-60 ${className}`}
        style={{ paddingLeft: `${Math.max(3, cur.length * 0.6 + 1.4)}rem` }}
        {...rest}
      />
    </div>
  );
};

export default MoneyInput;

/** Whole-number / decimal field with a unit inside the box ("days", "%"). */
export const UnitInput: React.FC<{
  value: number | string | null | undefined;
  onChange: (raw: string) => void;
  unit: string;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  className?: string;
  /** Value to use when the box is left empty (e.g. 30 days). */
  fallback?: number;
}> = ({ value, onChange, unit, min = 0, max, step = 'any', placeholder, className = '', fallback }) => (
  <div className="relative">
    <input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => { if (fallback != null && e.target.value === '') onChange(String(fallback)); }}
      onWheel={(e) => e.currentTarget.blur()}
      className={`w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${className}`}
      style={{ paddingRight: `${unit.length * 0.55 + 1.4}rem` }}
    />
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{unit}</span>
  </div>
);
