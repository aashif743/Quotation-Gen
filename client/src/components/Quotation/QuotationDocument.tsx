import React from 'react';
import { QuotationTemplate } from '../../types';
import { formatCurrency, formatNumber } from '../../utils/calculations';

export interface QuotationDocData {
  quote_number?: string;
  client_name?: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  date?: string;
  expiry_days?: number;
  items?: { description: string; quantity: number; unit_price: number; total?: number }[];
  subtotal?: number;
  vat_amount?: number;
  ppda_amount?: number;
  grand_total?: number;
  notes?: string;
  terms_conditions?: string;
}

export interface QuotationDocCompany {
  name: string;
  address?: string;
  tpin?: string;
  bank_details?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  vat_rate?: number;
  ppda_rate?: number;
}

interface QuotationDocumentProps {
  data: QuotationDocData;
  company: QuotationDocCompany;
  template?: QuotationTemplate;
  /** Class applied to the root element (PDF capture uses `.quotation-document`). */
  rootClassName?: string;
}

// In dev the React dev server proxies /uploads to the Express API (see the
// `proxy` field in client/package.json); in production the same Express
// process serves both, so a relative URL works in both environments.
const resolveLogoUrl = (url: string) => url;

// Keep the document at A4 portrait proportions so the bottom block always
// lands at the bottom of the page, regardless of how many line items there are.
const A4_STYLE: React.CSSProperties = { aspectRatio: '210 / 297' };

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 17, g: 24, b: 39 };
};

const QuotationDocument: React.FC<QuotationDocumentProps> = ({
  data,
  company,
  template = 'classic',
  rootClassName = '',
}) => {
  const primary = company.primary_color || '#111827';
  const secondary = company.secondary_color || '#ffffff';
  const rgb = hexToRgb(primary);
  const tint = (a: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;

  const quoteNumber = data.quote_number || 'QT-0000';
  const clientName = data.client_name || 'Client Name';
  const items = data.items || [];
  const hasItems = items.length > 0;
  const itemTotal = (it: { quantity: number; unit_price: number; total?: number }) =>
    it.total != null ? it.total : it.quantity * it.unit_price;

  const quoteDate = data.date ? new Date(data.date).toLocaleDateString() : 'N/A';
  const expiryDate = (() => {
    if (!data.date || !data.expiry_days) return 'N/A';
    const d = new Date(data.date);
    d.setDate(d.getDate() + data.expiry_days);
    return d.toLocaleDateString();
  })();

  const vatLabel = company.vat_rate != null ? `VAT (${formatNumber(company.vat_rate * 100, 1)}%)` : 'VAT';
  const ppdaLabel = company.ppda_rate != null ? `PPDA (${formatNumber(company.ppda_rate * 100, 1)}%)` : 'PPDA';

  // Logos are banner-shaped (not square), so they're displayed with a capped
  // height and auto width, `object-contain`, so the whole mark is visible.
  // Falls back to an initial bubble when no logo is set.
  const HeaderLogo: React.FC<{ maxHeight: number; className?: string }> = ({ maxHeight, className = '' }) =>
    company.logo_url ? (
      <img
        src={resolveLogoUrl(company.logo_url)}
        alt={`${company.name} logo`}
        className={`object-contain ${className}`}
        style={{ maxHeight, width: 'auto' }}
      />
    ) : (
      <div
        className={`flex items-center justify-center font-bold rounded-lg ${className}`}
        style={{ width: maxHeight, height: maxHeight, backgroundColor: primary, color: secondary, fontSize: maxHeight * 0.4 }}
      >
        {company.name.charAt(0)}
      </div>
    );

  // Shared bottom block: notes + terms + thank-you, always centered and pinned
  // to the bottom of the page via `mt-auto`. Used by every template so the
  // closing sections look consistent across all quotations.
  const BottomBlock = (
    <div className="mt-auto pt-10 text-center">
      {(data.notes || data.terms_conditions) && (
        <div className="max-w-2xl mx-auto space-y-5 mb-8">
          {data.notes && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: primary }}>
                Notes
              </h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{data.notes}</p>
            </div>
          )}
          {data.terms_conditions && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: primary }}>
                Terms &amp; Conditions
              </h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{data.terms_conditions}</p>
            </div>
          )}
        </div>
      )}
      <div className="pt-5 border-t-2" style={{ borderColor: primary }}>
        <p className="text-sm text-gray-500">Thank you for your business!</p>
      </div>
    </div>
  );

  /* ----------------------------- CLASSIC ----------------------------- */
  const Classic = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      <div className="px-10 py-8 flex items-start justify-between" style={{ backgroundColor: tint(0.08) }}>
        <div className="flex flex-col">
          <HeaderLogo maxHeight={70} />
          <div className="mt-3 max-w-sm">
            {company.address && <p className="text-sm text-gray-600">{company.address}</p>}
            {company.tpin && <p className="text-xs text-gray-500 mt-0.5">TPIN: {company.tpin}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-4xl font-extrabold tracking-tight" style={{ color: primary }}>
            QUOTATION
          </h2>
          <p className="text-lg font-semibold text-gray-900 mt-1">{quoteNumber}</p>
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: primary }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="rounded-lg border p-4" style={{ borderColor: tint(0.25) }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>
              Quote To
            </p>
            <p className="font-semibold text-gray-900">{clientName}</p>
            {data.client_address && <p className="text-sm text-gray-600 mt-1">{data.client_address}</p>}
            {data.client_email && <p className="text-sm text-gray-600">{data.client_email}</p>}
            {data.client_phone && <p className="text-sm text-gray-600">{data.client_phone}</p>}
          </div>
          <div className="rounded-lg p-4 text-sm space-y-2" style={{ backgroundColor: tint(0.06) }}>
            <div className="flex justify-between">
              <span className="text-gray-500">Quote Date</span>
              <span className="font-medium text-gray-900">{quoteDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Valid Until</span>
              <span className="font-medium text-gray-900">{expiryDate}</span>
            </div>
            {company.bank_details && (
              <div className="pt-2 mt-2 border-t" style={{ borderColor: tint(0.2) }}>
                <span className="text-gray-500 block mb-0.5">Bank Details</span>
                <span className="text-gray-700 whitespace-pre-wrap text-xs">{company.bank_details}</span>
              </div>
            )}
          </div>
        </div>

        <table className="w-full mb-8">
          <thead>
            <tr className="text-left" style={{ backgroundColor: primary, color: secondary }}>
              <th className="px-4 py-3 font-semibold text-sm">Description</th>
              <th className="px-4 py-3 font-semibold text-sm text-center w-20">Qty</th>
              <th className="px-4 py-3 font-semibold text-sm text-right w-36">Unit Price</th>
              <th className="px-4 py-3 font-semibold text-sm text-right w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {hasItems ? (
              items.map((item, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 ? tint(0.04) : 'transparent' }}>
                  <td className="px-4 py-3 text-sm border-b border-gray-100 whitespace-pre-wrap">{item.description}</td>
                  <td className="px-4 py-3 text-sm border-b border-gray-100 text-center">{formatNumber(item.quantity)}</td>
                  <td className="px-4 py-3 text-sm border-b border-gray-100 text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-3 text-sm border-b border-gray-100 text-right font-medium">{formatCurrency(itemTotal(item))}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No items added yet</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-80 rounded-lg overflow-hidden border" style={{ borderColor: tint(0.2) }}>
            <div className="p-4 space-y-2 text-sm bg-gray-50">
              <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-medium">{formatCurrency(data.subtotal || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">{vatLabel}</span><span className="font-medium">{formatCurrency(data.vat_amount || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">{ppdaLabel}</span><span className="font-medium">{formatCurrency(data.ppda_amount || 0)}</span></div>
            </div>
            <div className="flex justify-between items-center px-4 py-3 font-bold" style={{ backgroundColor: primary, color: secondary }}>
              <span>Grand Total</span>
              <span className="text-lg">{formatCurrency(data.grand_total || 0)}</span>
            </div>
          </div>
        </div>

        {BottomBlock}
      </div>
    </div>
  );

  /* ------------------------------ MODERN ----------------------------- */
  const Modern = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      {/* Clean white header — lets the transparent logo show against the page,
          with the brand color carried by the accent stripe and the quote number.
          Tighter bottom padding keeps the accent stripe close to the logo. */}
      <div className="px-10 pt-8 pb-3 flex items-center justify-between bg-white">
        <div className="flex items-center space-x-5">
          <HeaderLogo maxHeight={100} />
          {company.address && <p className="text-sm text-gray-600 max-w-xs">{company.address}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm uppercase tracking-[0.35em] text-gray-400">Quotation</p>
          <p className="text-2xl font-bold mt-1" style={{ color: primary }}>{quoteNumber}</p>
        </div>
      </div>
      <div className="h-1.5" style={{ backgroundColor: primary }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Prepared For</p>
            <p className="text-xl font-bold text-gray-900">{clientName}</p>
            <div className="text-sm text-gray-600 mt-1 space-y-0.5">
              {data.client_address && <p>{data.client_address}</p>}
              {data.client_email && <p>{data.client_email}</p>}
              {data.client_phone && <p>{data.client_phone}</p>}
            </div>
            {company.bank_details && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Bank Details</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{company.bank_details}</p>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {[
              { l: 'Date', v: quoteDate },
              { l: 'Valid Until', v: expiryDate },
              ...(company.tpin ? [{ l: 'TPIN', v: company.tpin }] : []),
            ].map((m) => (
              <div key={m.l} className="rounded-lg px-3 py-2" style={{ backgroundColor: tint(0.08) }}>
                <p className="text-[10px] uppercase tracking-widest text-gray-500">{m.l}</p>
                <p className="text-sm font-semibold" style={{ color: primary }}>{m.v}</p>
              </div>
            ))}
          </div>
        </div>

        <table className="w-full mb-8">
          <thead>
            <tr className="text-gray-400 text-[11px] uppercase tracking-widest" style={{ borderBottom: `2px solid ${primary}` }}>
              <th className="pb-2 text-left font-semibold">Description</th>
              <th className="pb-2 text-center font-semibold w-20">Qty</th>
              <th className="pb-2 text-right font-semibold w-36">Unit Price</th>
              <th className="pb-2 text-right font-semibold w-36">Amount</th>
            </tr>
          </thead>
          <tbody>
            {hasItems ? (
              items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-4 text-sm text-gray-800 whitespace-pre-wrap font-medium">{item.description}</td>
                  <td className="py-4 text-sm text-center text-gray-600">{formatNumber(item.quantity)}</td>
                  <td className="py-4 text-sm text-right text-gray-600">{formatCurrency(item.unit_price)}</td>
                  <td className="py-4 text-sm text-right font-semibold text-gray-900">{formatCurrency(itemTotal(item))}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">No items added yet</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-80 rounded-2xl p-5" style={{ backgroundColor: tint(0.08) }}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-medium">{formatCurrency(data.subtotal || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">{vatLabel}</span><span className="font-medium">{formatCurrency(data.vat_amount || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">{ppdaLabel}</span><span className="font-medium">{formatCurrency(data.ppda_amount || 0)}</span></div>
            </div>
            <div className="mt-3 pt-3 border-t flex justify-between items-baseline" style={{ borderColor: tint(0.25) }}>
              <span className="font-semibold" style={{ color: primary }}>Grand Total</span>
              <span className="text-2xl font-extrabold" style={{ color: primary }}>{formatCurrency(data.grand_total || 0)}</span>
            </div>
          </div>
        </div>

        {BottomBlock}
      </div>
    </div>
  );

  /* ------------------------------ ELEGANT ---------------------------- */
  const Elegant = (
    <div
      className={`bg-white text-gray-800 flex flex-col ${rootClassName}`}
      style={{ ...A4_STYLE, fontFamily: 'Georgia, "Times New Roman", serif' }}
    >
      <div className="px-12 pt-10 pb-6 text-center">
        <div
          className="py-5 flex flex-col items-center gap-2"
          style={{ borderTop: `1px solid ${tint(0.4)}`, borderBottom: `1px solid ${tint(0.4)}` }}
        >
          <HeaderLogo maxHeight={80} />
          {company.address && <p className="text-xs text-gray-500 tracking-wide">{company.address}</p>}
        </div>
        <p className="mt-5 text-sm uppercase tracking-[0.5em] text-gray-500">Quotation</p>
        <p className="text-lg font-semibold text-gray-900" style={{ letterSpacing: '0.1em' }}>{quoteNumber}</p>
      </div>

      <div className="px-12 pb-10 flex-1 flex flex-col">
        <div className="grid grid-cols-2 gap-10 mb-8 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Prepared For</p>
            <p className="font-semibold text-gray-900 text-base">{clientName}</p>
            {data.client_address && <p className="text-gray-600 mt-1">{data.client_address}</p>}
            {data.client_email && <p className="text-gray-600">{data.client_email}</p>}
            {data.client_phone && <p className="text-gray-600">{data.client_phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Details</p>
            <p className="text-gray-600">Date: <span className="text-gray-900">{quoteDate}</span></p>
            <p className="text-gray-600">Valid Until: <span className="text-gray-900">{expiryDate}</span></p>
            {company.tpin && <p className="text-gray-600">TPIN: <span className="text-gray-900">{company.tpin}</span></p>}
          </div>
        </div>

        <table className="w-full mb-8">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-gray-500" style={{ borderBottom: `2px solid ${primary}` }}>
              <th className="py-3 text-left font-normal">Description</th>
              <th className="py-3 text-center font-normal w-20">Qty</th>
              <th className="py-3 text-right font-normal w-36">Unit Price</th>
              <th className="py-3 text-right font-normal w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {hasItems ? (
              items.map((item, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 ? tint(0.05) : 'transparent' }}>
                  <td className="px-3 py-3 text-sm whitespace-pre-wrap">{item.description}</td>
                  <td className="px-3 py-3 text-sm text-center">{formatNumber(item.quantity)}</td>
                  <td className="px-3 py-3 text-sm text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="px-3 py-3 text-sm text-right">{formatCurrency(itemTotal(item))}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">No items added yet</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end mb-2">
          <div className="w-80 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>{formatCurrency(data.subtotal || 0)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">{vatLabel}</span><span>{formatCurrency(data.vat_amount || 0)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">{ppdaLabel}</span><span>{formatCurrency(data.ppda_amount || 0)}</span></div>
          </div>
        </div>
        <div className="flex justify-between items-center px-6 py-4" style={{ backgroundColor: primary, color: secondary }}>
          <span className="uppercase tracking-widest text-sm">Grand Total</span>
          <span className="text-2xl font-semibold">{formatCurrency(data.grand_total || 0)}</span>
        </div>

        {company.bank_details && (
          <div className="mt-6 text-sm text-center">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1">Bank Details</p>
            <p className="text-gray-600 whitespace-pre-wrap">{company.bank_details}</p>
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  /* ------------------------------- BOLD ------------------------------ */
  const Bold = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      {/* Asymmetric split header: white side with logo (flush left), primary
          block with the title on the right. */}
      <div className="flex" style={{ minHeight: 130 }}>
        <div className="w-1/2 pl-5 pr-6 py-4 flex flex-col items-start justify-center">
          <HeaderLogo maxHeight={90} />
          <div className="mt-2 text-[11px] text-gray-500 space-y-0.5">
            {company.address && <p>{company.address}</p>}
            {company.tpin && <p>TPIN: {company.tpin}</p>}
          </div>
        </div>
        <div className="w-1/2 pl-6 pr-8 py-4 flex flex-col items-end justify-center" style={{ backgroundColor: primary, color: secondary }}>
          <h2 className="text-4xl font-black tracking-tight leading-none">QUOTATION</h2>
          <p className="mt-2 text-sm uppercase tracking-[0.3em] opacity-90">No. {quoteNumber}</p>
        </div>
      </div>
      <div className="h-2" style={{ backgroundColor: '#0f172a' }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        <div className="grid grid-cols-5 gap-6 mb-8">
          <div className="col-span-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">Prepared For</p>
            <p className="text-2xl font-black text-gray-900">{clientName}</p>
            <div className="mt-1 text-sm text-gray-600 space-y-0.5">
              {data.client_address && <p>{data.client_address}</p>}
              {data.client_email && <p>{data.client_email}</p>}
              {data.client_phone && <p>{data.client_phone}</p>}
            </div>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="px-3 py-2 rounded" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
              <p className="text-[10px] uppercase tracking-widest opacity-70">Issue Date</p>
              <p className="text-sm font-bold">{quoteDate}</p>
            </div>
            <div className="px-3 py-2 rounded bg-gray-100" style={{ borderLeft: `4px solid ${primary}` }}>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Valid Until</p>
              <p className="text-sm font-bold text-gray-900">{expiryDate}</p>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <table className="w-full border-separate" style={{ borderSpacing: '0 4px' }}>
            <thead>
              <tr className="text-[11px] uppercase tracking-widest" style={{ color: '#0f172a' }}>
                <th className="px-4 py-2 text-left font-black">Description</th>
                <th className="px-4 py-2 text-center font-black w-20">Qty</th>
                <th className="px-4 py-2 text-right font-black w-36">Unit Price</th>
                <th className="px-4 py-2 text-right font-black w-36">Amount</th>
              </tr>
            </thead>
            <tbody>
              {hasItems ? (
                items.map((item, i) => (
                  <tr key={i} className="bg-gray-50">
                    <td className="px-4 py-3 text-sm whitespace-pre-wrap font-medium" style={{ borderLeft: `4px solid ${primary}` }}>
                      {item.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">{formatNumber(item.quantity)}</td>
                    <td className="px-4 py-3 text-sm text-right">{formatCurrency(item.unit_price)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold">{formatCurrency(itemTotal(item))}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">No items added yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-96 overflow-hidden rounded">
            <div style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
              <div className="px-5 py-3 flex justify-between text-sm border-b border-white/10"><span className="opacity-80">Subtotal</span><span className="font-semibold">{formatCurrency(data.subtotal || 0)}</span></div>
              <div className="px-5 py-3 flex justify-between text-sm border-b border-white/10"><span className="opacity-80">{vatLabel}</span><span className="font-semibold">{formatCurrency(data.vat_amount || 0)}</span></div>
              <div className="px-5 py-3 flex justify-between text-sm"><span className="opacity-80">{ppdaLabel}</span><span className="font-semibold">{formatCurrency(data.ppda_amount || 0)}</span></div>
            </div>
            <div className="px-5 py-4 flex justify-between items-baseline" style={{ backgroundColor: primary, color: secondary }}>
              <span className="text-sm font-black uppercase tracking-widest">Grand Total</span>
              <span className="text-2xl font-black">{formatCurrency(data.grand_total || 0)}</span>
            </div>
          </div>
        </div>

        {company.bank_details && (
          <div className="mt-6 pl-3 text-sm" style={{ borderLeft: `4px solid ${primary}` }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1 font-bold">Bank Details</p>
            <p className="text-gray-600 whitespace-pre-wrap">{company.bank_details}</p>
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  switch (template) {
    case 'modern':
      return Modern;
    case 'elegant':
      return Elegant;
    case 'bold':
      return Bold;
    case 'classic':
    default:
      return Classic;
  }
};

export default QuotationDocument;
