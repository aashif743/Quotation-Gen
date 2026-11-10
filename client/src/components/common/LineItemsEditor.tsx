import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import CurrencyInput from './CurrencyInput';
import { formatCurrency, getActiveCurrency } from '../../utils/calculations';

/**
 * Line items for quotations, invoices, LPOs, purchases, delivery notes and
 * donations. One layout everywhere:
 *  - wide enough → a table: one header row, then Description · Qty · Unit
 *    price · Amount per line;
 *  - narrow (phone, or beside the live preview) → each line is a card with the
 *    description on top and the numbers below.
 * The switch is based on the editor's own width (CSS container query in
 * index.css: .li-editor), not the screen, so it also adapts to the preview.
 */
export type LineItem = Record<string, any> & { description: string };

interface Props<T extends LineItem> {
  items: T[];
  onChange: (items: T[]) => void;
  /** Field holding the price ('unit_price', 'unit_cost', 'unit_value'); null = no prices (delivery notes). */
  priceKey?: string | null;
  priceLabel?: string;
  /** A blank line for "Add item". */
  newItem: () => T;
  descriptionPlaceholder?: string;
  addLabel?: string;
  /** Keep at least this many lines (the last one can't be removed). */
  minItems?: number;
  /** Brand colour for the line numbers and amounts. */
  accent?: string;
  currency?: string;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Textarea that grows with its text (one line to start). */
const AutoTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: (el: HTMLTextAreaElement | null) => void }> = ({ inputRef, value, ...rest }) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [value]);
  // Re-fit when the width changes (window resized, preview shown / hidden).
  useEffect(() => {
    const el = ref.current;
    if (!el || !('ResizeObserver' in window)) return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      {...rest}
      value={value}
      rows={1}
      ref={(el) => { ref.current = el; inputRef?.(el); }}
    />
  );
};

function LineItemsEditor<T extends LineItem>({
  items, onChange, priceKey = 'unit_price', priceLabel = 'Unit price', newItem,
  descriptionPlaceholder = 'Describe the product or service…', addLabel = 'Add item', minItems = 1,
  accent = '#4f46e5', currency,
}: Props<T>) {
  const cur = currency || getActiveCurrency();
  const descRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const prevCount = useRef(items.length);

  // Focus the description of a line that was just added.
  useEffect(() => {
    if (items.length > prevCount.current) descRefs.current[items.length - 1]?.focus();
    prevCount.current = items.length;
  }, [items.length]);

  const update = (i: number, patch: Partial<T>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, k) => k !== i));
  const add = () => onChange([...items, newItem()]);
  const priced = !!priceKey;

  const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className={`li-editor ${priced ? 'li-priced' : 'li-qty-only'}`}>
      <div className="li-head" aria-hidden="true">
        <span>#</span>
        <span>Description</span>
        <span className="text-right">Qty</span>
        {priced && <span className="text-right">{priceLabel} ({cur})</span>}
        {priced && <span className="text-right">Amount</span>}
        <span />
      </div>

      <div className="li-rows">
        {items.map((it, i) => {
          const qty = num(it.quantity);
          const price = priced ? num(it[priceKey!]) : 0;
          return (
            <div key={i} className="li-row">
              <span className="li-no" style={{ color: accent, backgroundColor: `${accent}14` }}>{i + 1}</span>

              <div className="li-desc">
                <label className="li-label">Description</label>
                <AutoTextarea
                  inputRef={(el) => { descRefs.current[i] = el; }}
                  value={it.description}
                  onChange={(e) => update(i, { description: e.target.value } as unknown as Partial<T>)}
                  placeholder={descriptionPlaceholder}
                  className={`${input} resize-none overflow-hidden leading-snug`}
                  aria-label={`Item ${i + 1} description`}
                />
              </div>

              <div className="li-qty">
                <label className="li-label">Qty</label>
                <CurrencyInput
                  value={qty}
                  onChange={(n) => update(i, { quantity: n } as unknown as Partial<T>)}
                  placeholder="0"
                  className={`${input} text-right tabular-nums`}
                  aria-label={`Item ${i + 1} quantity`}
                />
              </div>

              {priced && (
                <div className="li-price">
                  <label className="li-label">{priceLabel}</label>
                  <div className="relative">
                    <span className="li-cur pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">{cur}</span>
                    <CurrencyInput
                      value={price}
                      onChange={(n) => update(i, { [priceKey!]: n } as unknown as Partial<T>)}
                      placeholder="0.00"
                      className={`${input} li-price-input text-right tabular-nums`}
                      aria-label={`Item ${i + 1} ${priceLabel.toLowerCase()}`}
                    />
                  </div>
                </div>
              )}

              {priced && (
                <div className="li-amount">
                  <label className="li-label">Amount</label>
                  <div className="li-amount-value tabular-nums" style={{ color: accent }} title={formatCurrency(qty * price)}>
                    {formatCurrency(qty * price)}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => remove(i)}
                disabled={items.length <= minItems}
                className="li-del inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                title="Remove this line"
                aria-label={`Remove item ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800"
      >
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
    </div>
  );
}

export default LineItemsEditor;
