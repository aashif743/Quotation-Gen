import React, { useRef, useState } from 'react';

interface Props {
  /** Current VAT rate as a fraction (0.165). 0 = without VAT. */
  rate: number;
  onChange: (rate: number) => void;
  /** Rate to use when VAT is switched back on (usually the company's rate). */
  defaultRate?: number;
  className?: string;
}

/**
 * VAT on/off switch with the rate beside it. Switching off sets the rate to
 * 0 (the document is made without VAT); switching on brings back the last
 * rate used, or the company's rate.
 */
const VatControl: React.FC<Props> = ({ rate, onChange, defaultRate = 0.165, className = '' }) => {
  const on = rate > 0;
  const lastRate = useRef<number>(on ? rate : defaultRate > 0 ? defaultRate : 0.165);
  if (on) lastRate.current = rate;
  // What is typed in the rate box while it has focus, so clearing it to type
  // a new rate doesn't switch VAT off half-way.
  const [typing, setTyping] = useState<string | null>(null);

  return (
    <div className={className}>
      <span className="block text-sm font-medium text-gray-700 mb-1">VAT {on ? <span className="font-normal text-gray-500">(added)</span> : null}</span>
      <div className="flex items-center gap-3 min-h-[42px]">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={on ? 'VAT on, click to remove VAT' : 'VAT off, click to add VAT'}
          onClick={() => onChange(on ? 0 : lastRate.current)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${on ? 'bg-emerald-500' : 'bg-gray-300 dark:!bg-gray-600'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
        {on ? (
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={typing ?? String(+(rate * 100).toFixed(4))}
                onFocus={(e) => setTyping(e.target.value)}
                onChange={(e) => {
                  setTyping(e.target.value);
                  const pct = parseFloat(e.target.value);
                  if (Number.isFinite(pct) && pct > 0) onChange(Math.min(pct, 100) / 100);
                }}
                onBlur={(e) => {
                  setTyping(null);
                  const pct = parseFloat(e.target.value);
                  if (!(Number.isFinite(pct) && pct > 0)) onChange(0); // left empty or 0: no VAT
                }}
                onWheel={(e) => e.currentTarget.blur()}
                className="w-20 pl-2.5 pr-6 py-1.5 text-sm border border-gray-300 rounded-lg text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="VAT rate in percent"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">%</span>
            </div>
          </div>
        ) : (
          <span className="text-sm text-gray-500 whitespace-nowrap">No VAT</span>
        )}
      </div>
    </div>
  );
};

export default VatControl;
