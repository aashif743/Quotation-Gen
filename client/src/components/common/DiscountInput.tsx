import React from 'react';
import { DiscountType } from '../../types';
import { getActiveCurrency } from '../../utils/calculations';
import CurrencyInput from './CurrencyInput';

/**
 * Optional document discount: a fixed amount or a percentage of the
 * subtotal. Empty / 0 means no discount.
 */
const DiscountInput: React.FC<{
  type?: DiscountType | null;
  value?: number | null;
  onChange: (type: DiscountType, value: number) => void;
  hint?: string;
  className?: string;
}> = ({ type, value, onChange, hint, className = '' }) => {
  const t: DiscountType = type === 'percent' ? 'percent' : 'amount';
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
      <div className="flex max-w-xs rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
        <div className="flex bg-gray-50 border-r border-gray-300">
          {(['amount', 'percent'] as DiscountType[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k, Number(value) || 0)}
              className={`px-3 text-sm font-medium ${t === k ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {k === 'amount' ? getActiveCurrency() : '%'}
            </button>
          ))}
        </div>
        <CurrencyInput
          value={Number(value) || 0}
          onChange={(n) => onChange(t, Math.max(0, t === 'percent' ? Math.min(n, 100) : n))}
          placeholder="0"
          className="flex-1 min-w-0 px-3 py-2 text-right tabular-nums focus:outline-none"
          aria-label={t === 'percent' ? 'Discount percent' : 'Discount amount'}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500">{hint || 'Optional. Taken off the subtotal before VAT.'}</p>
    </div>
  );
};

export default DiscountInput;
