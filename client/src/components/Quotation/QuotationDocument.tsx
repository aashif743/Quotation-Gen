import React from 'react';
import { QuotationTemplate } from '../../types';
import { formatCurrency, formatNumber } from '../../utils/calculations';
import SupremeDocument from '../Letterhead/SupremeDocument';

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
  title?: string | null;
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
  /** Letterhead JSON — used only by the 'supreme' design. */
  letterhead?: string | null;
  currency?: string;
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
  // Client-specific letterhead design (Supreme Printers).
  if (template === 'supreme') {
    return (
      <SupremeDocument
        kind="quotation"
        rootClassName={rootClassName}
        data={{ ...data, number: data.quote_number }}
        company={{
          name: company.name, tpin: company.tpin, bank_details: company.bank_details, logo_url: company.logo_url,
          primary_color: company.primary_color, secondary_color: company.secondary_color,
          vat_rate: company.vat_rate, currency: company.currency, letterhead: company.letterhead,
        }}
      />
    );
  }

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
  const hasNotes = !!data.notes;
  const hasTerms = !!data.terms_conditions;
  const BottomBlock = (
    <div className="mt-auto pt-10 text-center" data-pdf-keep>
      {(hasNotes || hasTerms) && (
        <div className="max-w-3xl mx-auto mb-8">
          <div
            className={`grid gap-8 ${hasNotes && hasTerms ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {hasNotes && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: primary }}>
                  Notes
                </h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{data.notes}</p>
              </div>
            )}
            {hasTerms && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: primary }}>
                  Terms &amp; Conditions
                </h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{data.terms_conditions}</p>
              </div>
            )}
          </div>
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
          <div className="w-80 rounded-lg overflow-hidden border" data-pdf-keep style={{ borderColor: tint(0.2) }}>
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
          <div className="w-80 rounded-2xl p-5" data-pdf-keep style={{ backgroundColor: tint(0.08) }}>
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

        <div data-pdf-keep>
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
          <div className="w-96 overflow-hidden rounded" data-pdf-keep>
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

  // Text colour that stays readable on the brand colour (some companies pick a
  // secondary colour that doesn't contrast with their primary).
  const brandLum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  const onPrimary = brandLum > 0.62 ? '#111827' : '#ffffff';
  const metaRows = [
    { l: 'Quotation No.', v: quoteNumber },
    { l: 'Date', v: quoteDate },
    { l: 'Valid Until', v: expiryDate },
    ...(company.tpin ? [{ l: 'TPIN', v: company.tpin }] : []),
  ];
  const ClientLines = (
    <>
      {data.client_address && <p>{data.client_address}</p>}
      {data.client_email && <p>{data.client_email}</p>}
      {data.client_phone && <p>{data.client_phone}</p>}
    </>
  );
  const TotalsLines: React.FC<{ className?: string; labelClass?: string }> = ({ className = '', labelClass = 'text-gray-500' }) => (
    <div className={`space-y-2 text-sm ${className}`}>
      <div className="flex justify-between"><span className={labelClass}>Subtotal</span><span className="font-medium">{formatCurrency(data.subtotal || 0)}</span></div>
      <div className="flex justify-between"><span className={labelClass}>{vatLabel}</span><span className="font-medium">{formatCurrency(data.vat_amount || 0)}</span></div>
      {(data.ppda_amount || 0) > 0 && (
        <div className="flex justify-between"><span className={labelClass}>{ppdaLabel}</span><span className="font-medium">{formatCurrency(data.ppda_amount || 0)}</span></div>
      )}
    </div>
  );
  const EmptyRow = (cols: number) => (
    <tr><td colSpan={cols} className="py-8 text-center text-gray-400 text-sm">No items added yet</td></tr>
  );

  /* ------------------------------ MINIMAL ---------------------------- */
  // Quiet, airy and typographic: hairlines instead of fills, one accent.
  const Minimal = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      <div className="px-14 pt-12 pb-8 flex items-start justify-between">
        <div>
          <HeaderLogo maxHeight={64} />
          <div className="mt-4 text-xs text-gray-500 space-y-0.5 max-w-xs">
            {company.address && <p>{company.address}</p>}
            {company.tpin && <p>TPIN {company.tpin}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-5xl font-light tracking-tight text-gray-900">Quotation</p>
          <p className="mt-2 text-sm font-medium" style={{ color: primary }}>{quoteNumber}</p>
        </div>
      </div>

      <div className="px-14 pb-12 flex-1 flex flex-col">
        <div className="grid grid-cols-3 gap-8 py-6 border-y border-gray-200 mb-10 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-2">Billed to</p>
            <p className="font-semibold text-gray-900">{clientName}</p>
            <div className="text-gray-500 mt-1 space-y-0.5">{ClientLines}</div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-2">Issued</p>
            <p className="text-gray-900">{quoteDate}</p>
            <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mt-4 mb-2">Valid until</p>
            <p className="text-gray-900">{expiryDate}</p>
          </div>
          <div>
            {company.bank_details && (
              <>
                <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-2">Payment</p>
                <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">{company.bank_details}</p>
              </>
            )}
          </div>
        </div>

        <table className="w-full mb-10">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.2em] text-gray-400">
              <th className="pb-3 text-left font-medium">Description</th>
              <th className="pb-3 text-center font-medium w-20">Qty</th>
              <th className="pb-3 text-right font-medium w-36">Rate</th>
              <th className="pb-3 text-right font-medium w-36">Amount</th>
            </tr>
          </thead>
          <tbody>
            {hasItems ? items.map((item, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-4 text-sm text-gray-800 whitespace-pre-wrap">{item.description}</td>
                <td className="py-4 text-sm text-center text-gray-500">{formatNumber(item.quantity)}</td>
                <td className="py-4 text-sm text-right text-gray-500">{formatCurrency(item.unit_price)}</td>
                <td className="py-4 text-sm text-right text-gray-900">{formatCurrency(itemTotal(item))}</td>
              </tr>
            )) : EmptyRow(4)}
          </tbody>
        </table>

        <div className="flex justify-end" data-pdf-keep>
          <div className="w-72">
            <TotalsLines labelClass="text-gray-400" />
            <div className="mt-4 pt-4 flex justify-between items-baseline" style={{ borderTop: `2px solid ${primary}` }}>
              <span className="text-xs uppercase tracking-[0.25em] text-gray-500">Total</span>
              <span className="text-2xl font-semibold text-gray-900">{formatCurrency(data.grand_total || 0)}</span>
            </div>
          </div>
        </div>

        {BottomBlock}
      </div>
    </div>
  );

  /* ----------------------------- CORPORATE --------------------------- */
  // Structured and businesslike: brand side rail, info strip, boxed totals.
  const Corporate = (
    <div className={`bg-white text-gray-800 flex ${rootClassName}`} style={A4_STYLE}>
      <div className="w-3 shrink-0" style={{ backgroundColor: primary }} />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-10 pt-9 pb-6 flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <HeaderLogo maxHeight={72} />
          </div>
          <div className="text-right text-xs text-gray-500 max-w-[45%]">
            <p className="text-sm font-bold text-gray-900">{company.name}</p>
            {company.address && <p className="mt-0.5">{company.address}</p>}
            {company.tpin && <p>TPIN: {company.tpin}</p>}
          </div>
        </div>

        <div className="mx-10 flex items-center justify-between rounded-lg px-5 py-3" style={{ backgroundColor: tint(0.08) }}>
          <h2 className="text-2xl font-extrabold tracking-wide" style={{ color: primary }}>QUOTATION</h2>
          <div className="flex gap-6 text-xs">
            {metaRows.map((m) => (
              <div key={m.l} className="text-right">
                <p className="uppercase tracking-wider text-gray-500">{m.l}</p>
                <p className="font-semibold text-gray-900 text-sm">{m.v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-10 py-7 flex-1 flex flex-col">
          <div className="mb-7 pl-4" style={{ borderLeft: `3px solid ${primary}` }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1">Prepared for</p>
            <p className="text-lg font-bold text-gray-900">{clientName}</p>
            <div className="text-sm text-gray-600 space-y-0.5">{ClientLines}</div>
          </div>

          <table className="w-full mb-6 border border-gray-200">
            <thead>
              <tr style={{ backgroundColor: primary, color: onPrimary }}>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider w-12">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Description</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider w-20">Qty</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider w-32">Unit Price</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider w-36">Amount</th>
              </tr>
            </thead>
            <tbody>
              {hasItems ? items.map((item, i) => (
                <tr key={i} className="border-t border-gray-200" style={{ backgroundColor: i % 2 ? tint(0.04) : '#fff' }}>
                  <td className="px-4 py-3 text-sm text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 text-sm whitespace-pre-wrap">{item.description}</td>
                  <td className="px-4 py-3 text-sm text-center">{formatNumber(item.quantity)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(itemTotal(item))}</td>
                </tr>
              )) : EmptyRow(5)}
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-8 items-start" data-pdf-keep>
            <div className="text-sm">
              {company.bank_details && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: primary }}>Bank details</p>
                  <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">{company.bank_details}</p>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <TotalsLines className="p-4" />
              <div className="flex justify-between items-center px-4 py-3 font-bold" style={{ backgroundColor: primary, color: onPrimary }}>
                <span className="uppercase tracking-wider text-sm">Grand Total</span>
                <span className="text-xl">{formatCurrency(data.grand_total || 0)}</span>
              </div>
            </div>
          </div>

          {BottomBlock}
        </div>
      </div>
    </div>
  );

  /* ----------------------------- EXECUTIVE --------------------------- */
  // Premium: deep charcoal header with a brand accent line, serif headings,
  // detail cards overlapping the header.
  const ink = '#0f172a';
  const Executive = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      <div className="px-12 pt-10 pb-20" style={{ backgroundColor: ink }}>
        <div className="flex items-start justify-between gap-6">
          <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
            <HeaderLogo maxHeight={60} />
          </div>
          <div className="text-right">
            <p className="text-4xl text-white tracking-wide" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Quotation</p>
            <p className="mt-1 text-sm font-semibold tracking-[0.3em] uppercase" style={{ color: brandLum > 0.3 ? primary : '#cbd5e1' }}>{quoteNumber}</p>
          </div>
        </div>
        <div className="mt-6 h-0.5 w-24" style={{ backgroundColor: primary }} />
        <div className="mt-3 text-xs text-gray-300 space-y-0.5">
          <p className="text-white font-semibold">{company.name}</p>
          {company.address && <p>{company.address}</p>}
          {company.tpin && <p>TPIN: {company.tpin}</p>}
        </div>
      </div>

      <div className="px-12 -mt-12 flex-1 flex flex-col pb-10">
        <div className="grid grid-cols-3 gap-4 mb-8" data-pdf-keep>
          <div className="col-span-2 rounded-xl bg-white p-5 border border-gray-200 shadow-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-400 mb-2">Prepared for</p>
            <p className="text-xl text-gray-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{clientName}</p>
            <div className="text-sm text-gray-600 mt-1 space-y-0.5">{ClientLines}</div>
          </div>
          <div className="rounded-xl bg-white p-5 border border-gray-200 shadow-md text-sm space-y-3">
            <div><p className="text-[10px] uppercase tracking-[0.25em] text-gray-400">Date</p><p className="font-semibold text-gray-900">{quoteDate}</p></div>
            <div><p className="text-[10px] uppercase tracking-[0.25em] text-gray-400">Valid until</p><p className="font-semibold text-gray-900">{expiryDate}</p></div>
          </div>
        </div>

        <table className="w-full mb-8">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.2em]" style={{ color: ink, borderBottom: `2px solid ${ink}` }}>
              <th className="py-3 text-left font-bold">Description</th>
              <th className="py-3 text-center font-bold w-20">Qty</th>
              <th className="py-3 text-right font-bold w-36">Unit Price</th>
              <th className="py-3 text-right font-bold w-36">Amount</th>
            </tr>
          </thead>
          <tbody>
            {hasItems ? items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-4 pr-3 text-sm text-gray-800 whitespace-pre-wrap">{item.description}</td>
                <td className="py-4 text-sm text-center text-gray-600">{formatNumber(item.quantity)}</td>
                <td className="py-4 text-sm text-right text-gray-600">{formatCurrency(item.unit_price)}</td>
                <td className="py-4 text-sm text-right font-semibold text-gray-900">{formatCurrency(itemTotal(item))}</td>
              </tr>
            )) : EmptyRow(4)}
          </tbody>
        </table>

        <div className="flex justify-between items-start gap-8" data-pdf-keep>
          <div className="text-sm max-w-xs">
            {company.bank_details && (
              <>
                <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-1">Bank details</p>
                <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">{company.bank_details}</p>
              </>
            )}
          </div>
          <div className="w-80">
            <TotalsLines className="px-1" />
            <div className="mt-3 rounded-xl px-5 py-4 flex justify-between items-center" style={{ backgroundColor: ink }}>
              <span className="text-xs uppercase tracking-[0.25em] text-gray-300">Grand Total</span>
              <span className="text-2xl font-semibold text-white">{formatCurrency(data.grand_total || 0)}</span>
            </div>
            <div className="h-1 rounded-b-xl mx-3" style={{ backgroundColor: primary }} />
          </div>
        </div>

        {BottomBlock}
      </div>
    </div>
  );

  /* ------------------------------ GRADIENT --------------------------- */
  // Contemporary: brand gradient header with a soft curve, card-style rows
  // and a gradient total pill.
  const gradient = `linear-gradient(135deg, ${primary} 0%, ${tint(0.72)} 100%)`;
  const Gradient = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      <div className="px-12 pt-10 pb-14" style={{ background: gradient, borderBottomLeftRadius: 48, borderBottomRightRadius: 48 }}>
        <div className="flex items-start justify-between gap-6">
          <div className="rounded-2xl bg-white/95 px-4 py-3 shadow-sm">
            <HeaderLogo maxHeight={58} />
          </div>
          <div className="text-right" style={{ color: onPrimary }}>
            <p className="text-xs uppercase tracking-[0.35em] opacity-80">Quotation</p>
            <p className="text-3xl font-extrabold mt-1">{quoteNumber}</p>
            <p className="text-sm opacity-90 mt-1">{quoteDate}</p>
          </div>
        </div>
      </div>

      <div className="px-12 -mt-8 flex-1 flex flex-col pb-10">
        <div className="grid grid-cols-2 gap-4 mb-8" data-pdf-keep>
          <div className="rounded-2xl bg-white p-5 shadow-md border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: primary }}>Quote for</p>
            <p className="text-lg font-bold text-gray-900">{clientName}</p>
            <div className="text-sm text-gray-500 mt-1 space-y-0.5">{ClientLines}</div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-md border border-gray-100 text-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: primary }}>From</p>
            <p className="font-bold text-gray-900">{company.name}</p>
            <div className="text-gray-500 mt-1 space-y-0.5">
              {company.address && <p>{company.address}</p>}
              {company.tpin && <p>TPIN: {company.tpin}</p>}
              <p>Valid until <span className="font-semibold text-gray-800">{expiryDate}</span></p>
            </div>
          </div>
        </div>

        <table className="w-full mb-8 border-separate" style={{ borderSpacing: '0 6px' }}>
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              <th className="px-4 pb-1 text-left">Item</th>
              <th className="px-4 pb-1 text-center w-20">Qty</th>
              <th className="px-4 pb-1 text-right w-36">Price</th>
              <th className="px-4 pb-1 text-right w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {hasItems ? items.map((item, i) => (
              <tr key={i}>
                <td className="px-4 py-3 text-sm whitespace-pre-wrap rounded-l-xl" style={{ backgroundColor: tint(0.06) }}>{item.description}</td>
                <td className="px-4 py-3 text-sm text-center" style={{ backgroundColor: tint(0.06) }}>{formatNumber(item.quantity)}</td>
                <td className="px-4 py-3 text-sm text-right" style={{ backgroundColor: tint(0.06) }}>{formatCurrency(item.unit_price)}</td>
                <td className="px-4 py-3 text-sm text-right font-bold rounded-r-xl" style={{ backgroundColor: tint(0.06) }}>{formatCurrency(itemTotal(item))}</td>
              </tr>
            )) : EmptyRow(4)}
          </tbody>
        </table>

        <div className="flex justify-between items-start gap-8" data-pdf-keep>
          <div className="text-sm max-w-xs">
            {company.bank_details && (
              <div className="rounded-2xl p-4" style={{ backgroundColor: tint(0.06) }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: primary }}>Bank details</p>
                <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">{company.bank_details}</p>
              </div>
            )}
          </div>
          <div className="w-80">
            <TotalsLines className="px-2" />
            <div className="mt-3 rounded-full px-6 py-3.5 flex justify-between items-center shadow-md" style={{ background: gradient, color: onPrimary }}>
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Total</span>
              <span className="text-2xl font-extrabold">{formatCurrency(data.grand_total || 0)}</span>
            </div>
          </div>
        </div>

        {BottomBlock}
      </div>
    </div>
  );

  switch (template) {
    case 'minimal':
      return Minimal;
    case 'corporate':
      return Corporate;
    case 'executive':
      return Executive;
    case 'gradient':
      return Gradient;
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
