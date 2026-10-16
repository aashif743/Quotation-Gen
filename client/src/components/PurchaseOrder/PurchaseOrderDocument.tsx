import React from 'react';
import { formatCurrency } from '../../utils/calculations';
import { PurchaseOrder } from '../../types/purchaseOrders';
import { formatPoDate, formatQty } from './poUtils';

interface PurchaseOrderDocumentProps {
  po: PurchaseOrder;
  rootClassName?: string;
}

const A4_STYLE: React.CSSProperties = { aspectRatio: '210 / 297' };

// The global dark-mode stylesheet re-skins Tailwind gray/white utilities and
// only exempts the older document classes, so this document pins its palette
// with inline colors to stay light on screen and in the PDF in either theme.
const INK = {
  900: '#111827',
  800: '#1f2937',
  700: '#374151',
  600: '#4b5563',
  500: '#6b7280',
  400: '#9ca3af',
  line: '#e5e7eb',
  rule: '#9ca3af',
};

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 17, g: 24, b: 39 };
};

const PurchaseOrderDocument: React.FC<PurchaseOrderDocumentProps> = ({ po, rootClassName = '' }) => {
  const primary = po.primary_color || '#111827';
  const secondary = po.secondary_color || '#ffffff';
  const rgb = hexToRgb(primary);
  const tint = (a: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;

  const companyName = po.company_name || '';
  const logo = po.company_quote_logo || po.company_logo;
  const items = po.items || [];
  const subtotal = Number(po.subtotal) || 0;
  const vat = Number(po.vat_amount) || 0;
  const total = Number(po.grand_total) || 0;
  const vatRate = Number(po.company_vat_rate) || 0;
  const deliverTo = po.delivery_address || po.company_address || '';

  const cell = 'px-4 py-3 text-sm align-top';
  const cellStyle: React.CSSProperties = { borderBottom: `1px solid ${INK.line}`, color: INK[800] };

  const sectionLabel = (text: string) => (
    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>
      {text}
    </p>
  );

  const signBlock = (title: string, caption: string) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: primary }}>
        {title}
      </p>
      <div
        className="pt-2 text-[10px] uppercase tracking-widest"
        style={{ borderTop: `1px solid ${INK.rule}`, color: INK[500] }}
      >
        {caption}
      </div>
    </div>
  );

  return (
    <div
      className={`flex flex-col ${rootClassName}`}
      style={{ ...A4_STYLE, backgroundColor: '#ffffff', color: INK[800], colorScheme: 'light' }}
    >
      {/* Header */}
      <div className="px-10 py-7 flex items-start justify-between" style={{ backgroundColor: tint(0.06) }}>
        <div className="flex flex-col">
          {logo ? (
            <img src={logo} alt={`${companyName} logo`} className="object-contain" style={{ maxHeight: 80, width: 'auto' }} />
          ) : (
            <div
              className="rounded-lg flex items-center justify-center font-bold"
              style={{ width: 70, height: 70, backgroundColor: primary, color: secondary, fontSize: 28 }}
            >
              {companyName.charAt(0)}
            </div>
          )}
          <div className="mt-3 max-w-sm">
            {companyName && !logo && <p className="font-semibold" style={{ color: INK[900] }}>{companyName}</p>}
            {po.company_address && (
              <p className="text-sm whitespace-pre-wrap" style={{ color: INK[600] }}>{po.company_address}</p>
            )}
            {po.company_tpin && <p className="text-xs mt-0.5" style={{ color: INK[500] }}>TPIN: {po.company_tpin}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-extrabold tracking-tight leading-tight" style={{ color: primary }}>
            LOCAL PURCHASE ORDER
          </h2>
          <p className="text-lg font-semibold mt-1" style={{ color: INK[900] }}>{po.lpo_number}</p>
          <p className="text-sm mt-1" style={{ color: INK[500] }}>Date: {formatPoDate(po.date) || 'N/A'}</p>
          {po.delivery_date && (
            <p className="text-sm" style={{ color: INK[500] }}>Delivery by: {formatPoDate(po.delivery_date)}</p>
          )}
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: primary }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        {/* Supplier / Deliver To */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="rounded-lg p-4" style={{ border: `1px solid ${tint(0.25)}` }}>
            {sectionLabel('Supplier')}
            <p className="font-semibold" style={{ color: INK[900] }}>{po.vendor_name}</p>
            {po.vendor_address && (
              <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: INK[600] }}>{po.vendor_address}</p>
            )}
            {po.vendor_email && <p className="text-sm" style={{ color: INK[600] }}>{po.vendor_email}</p>}
            {po.vendor_phone && <p className="text-sm" style={{ color: INK[600] }}>{po.vendor_phone}</p>}
          </div>
          <div className="rounded-lg p-4" style={{ border: `1px solid ${tint(0.25)}` }}>
            {sectionLabel('Deliver To')}
            <p className="font-semibold" style={{ color: INK[900] }}>{companyName}</p>
            {deliverTo && (
              <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: INK[600] }}>{deliverTo}</p>
            )}
            {po.payment_terms && (
              <p className="text-sm mt-2" style={{ color: INK[600] }}>
                <span className="font-medium" style={{ color: INK[700] }}>Payment terms: </span>
                {po.payment_terms}
              </p>
            )}
          </div>
        </div>

        {/* Items */}
        <table className="w-full">
          <thead>
            <tr className="text-left" style={{ backgroundColor: primary, color: secondary }}>
              <th className="px-4 py-3 font-semibold text-sm w-12 text-center">#</th>
              <th className="px-4 py-3 font-semibold text-sm">Description</th>
              <th className="px-4 py-3 font-semibold text-sm text-center w-20">Qty</th>
              <th className="px-4 py-3 font-semibold text-sm text-right w-32">Unit Cost</th>
              <th className="px-4 py-3 font-semibold text-sm text-right w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((it, i) => {
                const lineTotal = it.total != null ? Number(it.total) : (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0);
                return (
                  <tr key={it.id ?? i} style={{ backgroundColor: i % 2 ? tint(0.04) : 'transparent' }}>
                    <td className={`${cell} text-center`} style={{ ...cellStyle, color: INK[500] }}>{i + 1}</td>
                    <td className={`${cell} whitespace-pre-wrap`} style={cellStyle}>{it.description}</td>
                    <td className={`${cell} text-center tabular-nums`} style={cellStyle}>{formatQty(it.quantity)}</td>
                    <td className={`${cell} text-right tabular-nums`} style={cellStyle}>{formatCurrency(Number(it.unit_cost) || 0)}</td>
                    <td className={`${cell} text-right tabular-nums font-medium`} style={{ ...cellStyle, color: INK[900] }}>
                      {formatCurrency(lineTotal)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: INK[400] }}>
                  No items added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-6" data-pdf-keep>
          <div className="w-72 text-sm">
            <div className="flex justify-between py-1.5" style={{ color: INK[600] }}>
              <span>Subtotal</span>
              <span className="tabular-nums" style={{ color: INK[900] }}>{formatCurrency(subtotal)}</span>
            </div>
            {vat > 0 && (
              <div className="flex justify-between py-1.5" style={{ color: INK[600] }}>
                <span>VAT{vatRate > 0 ? ` (${+(vatRate * 100).toFixed(2)}%)` : ''}</span>
                <span className="tabular-nums" style={{ color: INK[900] }}>{formatCurrency(vat)}</span>
              </div>
            )}
            <div
              className="flex justify-between items-center mt-2 px-3 py-2.5 rounded-md font-bold text-base"
              style={{ backgroundColor: primary, color: secondary }}
            >
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Notes / terms */}
        {(po.notes || po.terms_conditions) && (
          <div className="mt-8 grid gap-4" data-pdf-keep>
            {po.notes && (
              <div>
                {sectionLabel('Notes')}
                <p className="text-sm whitespace-pre-wrap" style={{ color: INK[700] }}>{po.notes}</p>
              </div>
            )}
            {po.terms_conditions && (
              <div>
                {sectionLabel('Terms & Conditions')}
                <p className="text-sm whitespace-pre-wrap" style={{ color: INK[700] }}>{po.terms_conditions}</p>
              </div>
            )}
          </div>
        )}

        {/* Sign-off — pinned to the bottom of the page */}
        <div className="mt-auto pt-12" data-pdf-keep>
          <div className="grid grid-cols-3 gap-8">
            {signBlock('Prepared By', po.created_by_name ? `${po.created_by_name} · Signature` : 'Name & Signature')}
            {signBlock('Authorised By', 'Name, Signature & Stamp')}
            {signBlock('Supplier Acknowledgement', 'Name, Signature & Date')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderDocument;
