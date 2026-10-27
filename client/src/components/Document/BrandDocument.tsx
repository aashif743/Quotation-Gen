import React from 'react';

/**
 * The company's chosen document design (Settings → Quotation Design), shared
 * by quotations, invoices, delivery notes and job cards. Each design is a
 * layout shell; the document type supplies the title, the details (meta),
 * the party block, the item columns and either totals + "thank you" or
 * signature lines. A4 portrait proportions keep the closing block at the
 * bottom of the page.
 */

export type DocKind = 'quotation' | 'invoice' | 'delivery' | 'job_card';
export type ColRole = 'num' | 'desc' | 'qty' | 'price' | 'amount' | 'text';

export interface DocMeta { l: string; v: React.ReactNode }
export interface DocColumn {
  label: string;
  role: ColRole;
  /** Tailwind width class, e.g. 'w-20'. */
  width?: string;
}

export interface BrandDocCompany {
  name: string;
  address?: string | null;
  tpin?: string | null;
  bank_details?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

export interface BrandDocumentProps {
  template?: string | null;
  kind: DocKind;
  rootClassName?: string;
  company: BrandDocCompany;
  /** Document title in natural case, e.g. "Quotation", "Delivery Note". */
  title: string;
  number: string;
  /** Details shown beside the party block. The first entry is the issue date. */
  meta: DocMeta[];
  party: { label: string; name: string; lines: (string | null | undefined)[] };
  columns: DocColumn[];
  /** One array of cell contents per row, in `columns` order (no "#" cell). */
  rows: React.ReactNode[][];
  /** Prefix a running "#" column. */
  numbered?: boolean;
  totals?: { lines: { l: string; v: string }[]; grandLabel?: string; grand: string };
  showBank?: boolean;
  /** Extra sections between the party block and the items (e.g. job instructions). */
  blocks?: { label: string; content: React.ReactNode }[];
  notes?: string | null;
  terms?: string | null;
  /** Signature lines instead of the "thank you" footer (delivery notes, job cards). */
  signatures?: { title: string; caption: string }[];
}

type Align = 'text-left' | 'text-center' | 'text-right';
const ALIGN: Record<ColRole, Align> = {
  num: 'text-center', desc: 'text-left', text: 'text-left', qty: 'text-center', price: 'text-right', amount: 'text-right',
};

interface TableLook {
  tableClass?: string;
  tableStyle?: React.CSSProperties;
  headRowClass?: string;
  headRowStyle?: React.CSSProperties;
  th: string;
  td: (role: ColRole) => string;
  cellStyle?: (row: number, col: number, cols: number) => React.CSSProperties | undefined;
  cellClass?: (col: number, cols: number) => string;
  rowClass?: (row: number) => string | undefined;
  rowStyle?: (row: number) => React.CSSProperties | undefined;
  /** Column label overrides for this design. */
  labels?: Partial<Record<ColRole, string>>;
  numAlign?: Align;
}

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 17, g: 24, b: 39 };
};

const A4_STYLE: React.CSSProperties = { aspectRatio: '210 / 297' };
const SERIF = 'Georgia, "Times New Roman", serif';

const BrandDocument: React.FC<BrandDocumentProps> = ({
  template = 'classic',
  kind,
  rootClassName = '',
  company,
  title,
  number,
  meta,
  party,
  columns,
  rows,
  numbered = false,
  totals,
  showBank = false,
  blocks = [],
  notes,
  terms,
  signatures,
}) => {
  const primary = company.primary_color || '#111827';
  const secondary = company.secondary_color || '#ffffff';
  const rgb = hexToRgb(primary);
  const tint = (a: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  // Text colour that stays readable on the brand colour (some companies pick a
  // secondary colour that doesn't contrast with their primary).
  const brandLum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  const onPrimary = brandLum > 0.62 ? '#111827' : '#ffffff';
  const ink = '#0f172a';

  const TITLE = title.toUpperCase();
  const isQuote = kind === 'quotation';
  // Quotations keep each design's own wording for the client block.
  const partyLabel = (quoteWording: string) => (isQuote ? quoteWording : party.label);
  const issueDate = meta[0]?.v;
  const bank = showBank && company.bank_details ? company.bank_details : null;
  const partyLines = party.lines.filter(Boolean) as string[];
  const PartyLines = <>{partyLines.map((l, i) => <p key={i}>{l}</p>)}</>;

  // Banner-shaped logos: capped height, auto width, whole mark visible. Falls
  // back to an initial bubble when no logo is set.
  const HeaderLogo: React.FC<{ maxHeight: number; className?: string }> = ({ maxHeight, className = '' }) =>
    company.logo_url ? (
      <img
        src={company.logo_url}
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

  /* ------------------------------ shared parts ------------------------------ */

  const Blocks = blocks.length > 0 && (
    <div className="space-y-4 mb-6">
      {blocks.map((b) => (
        <div key={b.label} className="rounded-lg border p-4" style={{ borderColor: tint(0.25), backgroundColor: tint(0.03) }} data-pdf-keep>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>{b.label}</p>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{b.content}</div>
        </div>
      ))}
    </div>
  );

  const Table: React.FC<{ look: TableLook }> = ({ look }) => {
    const cols: DocColumn[] = [...(numbered ? [{ label: '#', role: 'num' as ColRole, width: 'w-12' }] : []), ...columns];
    const align = (c: DocColumn) => (c.role === 'num' && look.numAlign ? look.numAlign : ALIGN[c.role]);
    return (
      <table className={look.tableClass ?? 'w-full mb-8'} style={look.tableStyle}>
        <thead>
          <tr className={look.headRowClass} style={look.headRowStyle}>
            {cols.map((c, i) => (
              <th key={i} className={`${look.th} ${align(c)} ${c.width || ''}`}>
                {(c.role !== 'num' && look.labels?.[c.role]) || c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((cells, r) => {
            const all = numbered ? [r + 1, ...cells] : cells;
            return (
              <tr key={r} className={look.rowClass?.(r)} style={look.rowStyle?.(r)}>
                {all.map((cell, c) => (
                  <td
                    key={c}
                    className={`${look.td(cols[c].role)} ${align(cols[c])} ${look.cellClass?.(c, cols.length) || ''}`}
                    style={look.cellStyle?.(r, c, cols.length)}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          }) : (
            <tr><td colSpan={cols.length} className="py-8 text-center text-gray-400 text-sm">No items added yet</td></tr>
          )}
        </tbody>
      </table>
    );
  };

  const TotalsLines: React.FC<{ className?: string; labelClass?: string; valueClass?: string }> = ({
    className = '', labelClass = 'text-gray-500', valueClass = 'font-medium',
  }) => (
    <div className={`space-y-2 text-sm ${className}`}>
      {totals?.lines.map((t) => (
        <div key={t.l} className="flex justify-between"><span className={labelClass}>{t.l}</span><span className={valueClass}>{t.v}</span></div>
      ))}
    </div>
  );
  const grandLabel = totals?.grandLabel || 'Grand Total';

  // Notes + terms, then the "thank you" line or the signature lines — always
  // centred and pinned to the bottom of the page via `mt-auto`.
  const hasNotes = !!notes;
  const hasTerms = !!terms;
  const BottomBlock = (
    <div className={`mt-auto pt-10 ${signatures ? '' : 'text-center'}`} data-pdf-keep>
      {(hasNotes || hasTerms) && (
        <div className={`max-w-3xl mb-8 ${signatures ? '' : 'mx-auto'}`}>
          <div className={`grid gap-8 ${hasNotes && hasTerms ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {hasNotes && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: primary }}>Notes</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{notes}</p>
              </div>
            )}
            {hasTerms && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: primary }}>Terms &amp; Conditions</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{terms}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {signatures ? (
        <div className={`grid gap-10 pt-2 ${signatures.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {signatures.map((s) => (
            <div key={s.title}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: primary }}>{s.title}</p>
              <div className="border-t border-gray-400 pt-2 text-xs uppercase tracking-widest text-gray-500">{s.caption}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pt-5 border-t-2" style={{ borderColor: primary }}>
          <p className="text-sm text-gray-500">Thank you for your business!</p>
        </div>
      )}
    </div>
  );

  // Bank details + totals row used by several designs. Nothing is rendered
  // when a document has neither (delivery notes, job cards).
  const hasSummary = !!bank || !!totals;

  /* --------------------------------- CLASSIC -------------------------------- */
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
          <h2 className="text-4xl font-extrabold tracking-tight" style={{ color: primary }}>{TITLE}</h2>
          <p className="text-lg font-semibold text-gray-900 mt-1">{number}</p>
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: primary }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="rounded-lg border p-4" style={{ borderColor: tint(0.25) }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>{partyLabel('Quote To')}</p>
            <p className="font-semibold text-gray-900">{party.name}</p>
            <div className="text-sm text-gray-600 mt-1">{PartyLines}</div>
          </div>
          <div className="rounded-lg p-4 text-sm space-y-2" style={{ backgroundColor: tint(0.06) }}>
            {meta.map((m) => (
              <div key={m.l} className="flex justify-between gap-4">
                <span className="text-gray-500">{m.l}</span>
                <span className="font-medium text-gray-900 text-right">{m.v}</span>
              </div>
            ))}
            {bank && (
              <div className="pt-2 mt-2 border-t" style={{ borderColor: tint(0.2) }}>
                <span className="text-gray-500 block mb-0.5">Bank Details</span>
                <span className="text-gray-700 whitespace-pre-wrap text-xs">{bank}</span>
              </div>
            )}
          </div>
        </div>

        {Blocks}

        <Table look={{
          headRowClass: 'text-left', headRowStyle: { backgroundColor: primary, color: secondary },
          th: 'px-4 py-3 font-semibold text-sm',
          td: (role) => `px-4 py-3 text-sm border-b border-gray-100 ${role === 'desc' || role === 'text' ? 'whitespace-pre-wrap' : ''} ${role === 'amount' ? 'font-medium' : ''} ${role === 'num' ? 'text-gray-500' : ''}`,
          rowStyle: (i) => ({ backgroundColor: i % 2 ? tint(0.04) : 'transparent' }),
        }} />

        {totals && (
          <div className="flex justify-end">
            <div className="w-80 rounded-lg overflow-hidden border" data-pdf-keep style={{ borderColor: tint(0.2) }}>
              <TotalsLines className="p-4 bg-gray-50" labelClass="text-gray-600" />
              <div className="flex justify-between items-center px-4 py-3 font-bold" style={{ backgroundColor: primary, color: secondary }}>
                <span>{grandLabel}</span>
                <span className="text-lg">{totals.grand}</span>
              </div>
            </div>
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  /* --------------------------------- MODERN --------------------------------- */
  const Modern = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      <div className="px-10 pt-8 pb-3 flex items-center justify-between bg-white">
        <div className="flex items-center space-x-5">
          <HeaderLogo maxHeight={100} />
          {company.address && <p className="text-sm text-gray-600 max-w-xs">{company.address}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm uppercase tracking-[0.35em] text-gray-400">{title}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: primary }}>{number}</p>
        </div>
      </div>
      <div className="h-1.5" style={{ backgroundColor: primary }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{partyLabel('Prepared For')}</p>
            <p className="text-xl font-bold text-gray-900">{party.name}</p>
            <div className="text-sm text-gray-600 mt-1 space-y-0.5">{PartyLines}</div>
            {bank && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Bank Details</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{bank}</p>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {[...meta, ...(company.tpin ? [{ l: 'TPIN', v: company.tpin }] : [])].map((m) => (
              <div key={m.l} className="rounded-lg px-3 py-2" style={{ backgroundColor: tint(0.08) }}>
                <p className="text-[10px] uppercase tracking-widest text-gray-500">{m.l}</p>
                <p className="text-sm font-semibold" style={{ color: primary }}>{m.v}</p>
              </div>
            ))}
          </div>
        </div>

        {Blocks}

        <Table look={{
          headRowClass: 'text-gray-400 text-[11px] uppercase tracking-widest', headRowStyle: { borderBottom: `2px solid ${primary}` },
          th: 'pb-2 font-semibold', labels: { amount: 'Amount' },
          td: (role) => role === 'desc' || role === 'text' ? 'py-4 text-sm text-gray-800 whitespace-pre-wrap font-medium'
            : role === 'amount' ? 'py-4 text-sm font-semibold text-gray-900'
            : role === 'num' ? 'py-4 text-sm text-gray-400' : 'py-4 text-sm text-gray-600',
          rowClass: () => 'border-b border-gray-100',
        }} />

        {totals && (
          <div className="flex justify-end">
            <div className="w-80 rounded-2xl p-5" data-pdf-keep style={{ backgroundColor: tint(0.08) }}>
              <TotalsLines labelClass="text-gray-600" />
              <div className="mt-3 pt-3 border-t flex justify-between items-baseline" style={{ borderColor: tint(0.25) }}>
                <span className="font-semibold" style={{ color: primary }}>{grandLabel}</span>
                <span className="text-2xl font-extrabold" style={{ color: primary }}>{totals.grand}</span>
              </div>
            </div>
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  /* --------------------------------- ELEGANT -------------------------------- */
  const Elegant = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={{ ...A4_STYLE, fontFamily: SERIF }}>
      <div className="px-12 pt-10 pb-6 text-center">
        <div className="py-5 flex flex-col items-center gap-2" style={{ borderTop: `1px solid ${tint(0.4)}`, borderBottom: `1px solid ${tint(0.4)}` }}>
          <HeaderLogo maxHeight={80} />
          {company.address && <p className="text-xs text-gray-500 tracking-wide">{company.address}</p>}
        </div>
        <p className="mt-5 text-sm uppercase tracking-[0.5em] text-gray-500">{title}</p>
        <p className="text-lg font-semibold text-gray-900" style={{ letterSpacing: '0.1em' }}>{number}</p>
      </div>

      <div className="px-12 pb-10 flex-1 flex flex-col">
        <div className="grid grid-cols-2 gap-10 mb-8 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">{partyLabel('Prepared For')}</p>
            <p className="font-semibold text-gray-900 text-base">{party.name}</p>
            <div className="text-gray-600 mt-1">{PartyLines}</div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Details</p>
            {meta.map((m) => <p key={m.l} className="text-gray-600">{m.l}: <span className="text-gray-900">{m.v}</span></p>)}
            {company.tpin && <p className="text-gray-600">TPIN: <span className="text-gray-900">{company.tpin}</span></p>}
          </div>
        </div>

        {Blocks}

        <Table look={{
          headRowClass: 'text-[11px] uppercase tracking-widest text-gray-500', headRowStyle: { borderBottom: `2px solid ${primary}` },
          th: 'py-3 font-normal',
          td: (role) => `px-3 py-3 text-sm ${role === 'desc' || role === 'text' ? 'whitespace-pre-wrap' : ''} ${role === 'num' ? 'text-gray-500' : ''}`,
          rowStyle: (i) => ({ backgroundColor: i % 2 ? tint(0.05) : 'transparent' }),
        }} />

        {totals && (
          <div data-pdf-keep>
            <div className="flex justify-end mb-2">
              <TotalsLines className="w-80" labelClass="text-gray-600" valueClass="" />
            </div>
            <div className="flex justify-between items-center px-6 py-4" style={{ backgroundColor: primary, color: secondary }}>
              <span className="uppercase tracking-widest text-sm">{grandLabel}</span>
              <span className="text-2xl font-semibold">{totals.grand}</span>
            </div>
          </div>
        )}

        {bank && (
          <div className="mt-6 text-sm text-center">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1">Bank Details</p>
            <p className="text-gray-600 whitespace-pre-wrap">{bank}</p>
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  /* ---------------------------------- BOLD ---------------------------------- */
  const Bold = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      <div className="flex" style={{ minHeight: 130 }}>
        <div className="w-1/2 pl-5 pr-6 py-4 flex flex-col items-start justify-center">
          <HeaderLogo maxHeight={90} />
          <div className="mt-2 text-[11px] text-gray-500 space-y-0.5">
            {company.address && <p>{company.address}</p>}
            {company.tpin && <p>TPIN: {company.tpin}</p>}
          </div>
        </div>
        <div className="w-1/2 pl-6 pr-8 py-4 flex flex-col items-end justify-center text-right" style={{ backgroundColor: primary, color: secondary }}>
          <h2 className={`${TITLE.length > 10 ? 'text-3xl' : 'text-4xl'} font-black tracking-tight leading-none`}>{TITLE}</h2>
          <p className="mt-2 text-sm uppercase tracking-[0.3em] opacity-90">No. {number}</p>
        </div>
      </div>
      <div className="h-2" style={{ backgroundColor: ink }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        <div className="grid grid-cols-5 gap-6 mb-8">
          <div className="col-span-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">{partyLabel('Prepared For')}</p>
            <p className="text-2xl font-black text-gray-900">{party.name}</p>
            <div className="mt-1 text-sm text-gray-600 space-y-0.5">{PartyLines}</div>
          </div>
          <div className="col-span-2 space-y-2">
            {meta.map((m, i) => i === 0 ? (
              <div key={m.l} className="px-3 py-2 rounded" style={{ backgroundColor: ink, color: '#ffffff' }}>
                <p className="text-[10px] uppercase tracking-widest opacity-70">{m.l}</p>
                <p className="text-sm font-bold">{m.v}</p>
              </div>
            ) : (
              <div key={m.l} className="px-3 py-2 rounded bg-gray-100" style={{ borderLeft: `4px solid ${primary}` }}>
                <p className="text-[10px] uppercase tracking-widest text-gray-500">{m.l}</p>
                <p className="text-sm font-bold text-gray-900">{m.v}</p>
              </div>
            ))}
          </div>
        </div>

        {Blocks}

        <div className="mb-8">
          <Table look={{
            tableClass: 'w-full border-separate', tableStyle: { borderSpacing: '0 4px' },
            headRowClass: 'text-[11px] uppercase tracking-widest', headRowStyle: { color: ink },
            th: 'px-4 py-2 font-black', labels: { amount: 'Amount' },
            td: (role) => `px-4 py-3 text-sm ${role === 'desc' || role === 'text' ? 'whitespace-pre-wrap font-medium' : ''} ${role === 'amount' ? 'font-bold' : ''} ${role === 'num' ? 'text-gray-500' : ''}`,
            rowClass: () => 'bg-gray-50',
            cellStyle: (_r, c) => (c === 0 ? { borderLeft: `4px solid ${primary}` } : undefined),
          }} />
        </div>

        {totals && (
          <div className="flex justify-end">
            <div className="w-96 overflow-hidden rounded" data-pdf-keep>
              <div style={{ backgroundColor: ink, color: '#ffffff' }}>
                {totals.lines.map((t, i) => (
                  <div key={t.l} className={`px-5 py-3 flex justify-between text-sm ${i < totals.lines.length - 1 ? 'border-b border-white/10' : ''}`}>
                    <span className="opacity-80">{t.l}</span><span className="font-semibold">{t.v}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 flex justify-between items-baseline" style={{ backgroundColor: primary, color: secondary }}>
                <span className="text-sm font-black uppercase tracking-widest">{grandLabel}</span>
                <span className="text-2xl font-black">{totals.grand}</span>
              </div>
            </div>
          </div>
        )}

        {bank && (
          <div className="mt-6 pl-3 text-sm" style={{ borderLeft: `4px solid ${primary}` }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1 font-bold">Bank Details</p>
            <p className="text-gray-600 whitespace-pre-wrap">{bank}</p>
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  /* --------------------------------- MINIMAL -------------------------------- */
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
          <p className={`${title.length > 10 ? 'text-4xl' : 'text-5xl'} font-light tracking-tight text-gray-900`}>{title}</p>
          <p className="mt-2 text-sm font-medium" style={{ color: primary }}>{number}</p>
        </div>
      </div>

      <div className="px-14 pb-12 flex-1 flex flex-col">
        <div className="grid grid-cols-3 gap-8 py-6 border-y border-gray-200 mb-10 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-2">{partyLabel('Billed to')}</p>
            <p className="font-semibold text-gray-900">{party.name}</p>
            <div className="text-gray-500 mt-1 space-y-0.5">{PartyLines}</div>
          </div>
          <div>
            {meta.slice(0, 3).map((m, i) => (
              <React.Fragment key={m.l}>
                <p className={`text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-2 ${i ? 'mt-4' : ''}`}>{m.l}</p>
                <p className="text-gray-900">{m.v}</p>
              </React.Fragment>
            ))}
          </div>
          <div>
            {bank ? (
              <>
                <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-2">Payment</p>
                <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">{bank}</p>
              </>
            ) : meta.slice(3).map((m, i) => (
              <React.Fragment key={m.l}>
                <p className={`text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-2 ${i ? 'mt-4' : ''}`}>{m.l}</p>
                <p className="text-gray-900">{m.v}</p>
              </React.Fragment>
            ))}
          </div>
        </div>

        {Blocks}

        <Table look={{
          tableClass: 'w-full mb-10',
          headRowClass: 'text-[10px] uppercase tracking-[0.2em] text-gray-400',
          th: 'pb-3 font-medium', labels: { price: 'Rate', amount: 'Amount' },
          td: (role) => role === 'desc' || role === 'text' ? 'py-4 text-sm text-gray-800 whitespace-pre-wrap'
            : role === 'amount' ? 'py-4 text-sm text-gray-900' : 'py-4 text-sm text-gray-500',
          rowClass: () => 'border-t border-gray-100',
        }} />

        {totals && (
          <div className="flex justify-end" data-pdf-keep>
            <div className="w-72">
              <TotalsLines labelClass="text-gray-400" />
              <div className="mt-4 pt-4 flex justify-between items-baseline" style={{ borderTop: `2px solid ${primary}` }}>
                <span className="text-xs uppercase tracking-[0.25em] text-gray-500">{totals.grandLabel || 'Total'}</span>
                <span className="text-2xl font-semibold text-gray-900">{totals.grand}</span>
              </div>
            </div>
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  /* -------------------------------- CORPORATE ------------------------------- */
  // Structured and businesslike: brand side rail, info strip, boxed totals.
  const corporateMeta = [{ l: `${title} No.`, v: number }, ...meta, ...(company.tpin ? [{ l: 'TPIN', v: company.tpin }] : [])];
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
          </div>
        </div>

        <div className="mx-10 flex items-center justify-between gap-4 rounded-lg px-5 py-3" style={{ backgroundColor: tint(0.08) }}>
          <h2 className={`${TITLE.length > 10 ? 'text-xl' : 'text-2xl'} font-extrabold tracking-wide whitespace-nowrap`} style={{ color: primary }}>{TITLE}</h2>
          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-xs">
            {corporateMeta.map((m) => (
              <div key={m.l} className="text-right">
                <p className="uppercase tracking-wider text-gray-500">{m.l}</p>
                <p className="font-semibold text-gray-900 text-sm">{m.v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-10 py-7 flex-1 flex flex-col">
          <div className="mb-7 pl-4" style={{ borderLeft: `3px solid ${primary}` }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1">{partyLabel('Prepared for')}</p>
            <p className="text-lg font-bold text-gray-900">{party.name}</p>
            <div className="text-sm text-gray-600 space-y-0.5">{PartyLines}</div>
          </div>

          {Blocks}

          <Table look={{
            tableClass: 'w-full mb-6 border border-gray-200',
            headRowStyle: { backgroundColor: primary, color: onPrimary },
            th: 'px-4 py-2.5 text-xs font-semibold uppercase tracking-wider', labels: { amount: 'Amount' }, numAlign: 'text-left',
            td: (role) => `px-4 py-3 text-sm ${role === 'num' ? 'text-gray-400' : ''} ${role === 'desc' || role === 'text' ? 'whitespace-pre-wrap' : ''} ${role === 'amount' ? 'font-semibold' : ''}`,
            rowClass: () => 'border-t border-gray-200',
            rowStyle: (i) => ({ backgroundColor: i % 2 ? tint(0.04) : '#fff' }),
          }} />

          {hasSummary && (
            <div className="grid grid-cols-2 gap-8 items-start" data-pdf-keep>
              <div className="text-sm">
                {bank && (
                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: primary }}>Bank details</p>
                    <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">{bank}</p>
                  </div>
                )}
              </div>
              {totals && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <TotalsLines className="p-4" />
                  <div className="flex justify-between items-center px-4 py-3 font-bold" style={{ backgroundColor: primary, color: onPrimary }}>
                    <span className="uppercase tracking-wider text-sm">{grandLabel}</span>
                    <span className="text-xl">{totals.grand}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {BottomBlock}
        </div>
      </div>
    </div>
  );

  /* -------------------------------- EXECUTIVE ------------------------------- */
  // Premium: deep charcoal header with a brand accent line, serif headings,
  // detail cards overlapping the header.
  const Executive = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      <div className="px-12 pt-10 pb-20" style={{ backgroundColor: ink }}>
        <div className="flex items-start justify-between gap-6">
          <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
            <HeaderLogo maxHeight={60} />
          </div>
          <div className="text-right">
            <p className="text-4xl text-white tracking-wide" style={{ fontFamily: SERIF }}>{title}</p>
            <p className="mt-1 text-sm font-semibold tracking-[0.3em] uppercase" style={{ color: brandLum > 0.3 ? primary : '#cbd5e1' }}>{number}</p>
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-400 mb-2">{partyLabel('Prepared for')}</p>
            <p className="text-xl text-gray-900" style={{ fontFamily: SERIF }}>{party.name}</p>
            <div className="text-sm text-gray-600 mt-1 space-y-0.5">{PartyLines}</div>
          </div>
          <div className="rounded-xl bg-white p-5 border border-gray-200 shadow-md text-sm space-y-3">
            {meta.map((m) => (
              <div key={m.l}><p className="text-[10px] uppercase tracking-[0.25em] text-gray-400">{m.l}</p><p className="font-semibold text-gray-900">{m.v}</p></div>
            ))}
          </div>
        </div>

        {Blocks}

        <Table look={{
          headRowClass: 'text-[11px] uppercase tracking-[0.2em]', headRowStyle: { color: ink, borderBottom: `2px solid ${ink}` },
          th: 'py-3 font-bold', labels: { amount: 'Amount' },
          td: (role) => role === 'desc' || role === 'text' ? 'py-4 pr-3 text-sm text-gray-800 whitespace-pre-wrap'
            : role === 'amount' ? 'py-4 text-sm font-semibold text-gray-900'
            : role === 'num' ? 'py-4 text-sm text-gray-400' : 'py-4 text-sm text-gray-600',
          rowClass: () => 'border-b border-gray-100',
        }} />

        {hasSummary && (
          <div className="flex justify-between items-start gap-8" data-pdf-keep>
            <div className="text-sm max-w-xs">
              {bank && (
                <>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-1">Bank details</p>
                  <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">{bank}</p>
                </>
              )}
            </div>
            {totals && (
              <div className="w-80">
                <TotalsLines className="px-1" />
                <div className="mt-3 rounded-xl px-5 py-4 flex justify-between items-center" style={{ backgroundColor: ink }}>
                  <span className="text-xs uppercase tracking-[0.25em] text-gray-300">{grandLabel}</span>
                  <span className="text-2xl font-semibold text-white">{totals.grand}</span>
                </div>
                <div className="h-1 rounded-b-xl mx-3" style={{ backgroundColor: primary }} />
              </div>
            )}
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  /* -------------------------------- GRADIENT -------------------------------- */
  // Contemporary: brand gradient header with a soft curve, card-style rows
  // and a gradient total pill.
  const gradient = `linear-gradient(135deg, ${primary} 0%, ${tint(0.72)} 100%)`;
  const cardBg = tint(0.06);
  const Gradient = (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      <div className="px-12 pt-10 pb-14" style={{ background: gradient, borderBottomLeftRadius: 48, borderBottomRightRadius: 48 }}>
        <div className="flex items-start justify-between gap-6">
          <div className="rounded-2xl bg-white/95 px-4 py-3 shadow-sm">
            <HeaderLogo maxHeight={58} />
          </div>
          <div className="text-right" style={{ color: onPrimary }}>
            <p className="text-xs uppercase tracking-[0.35em] opacity-80">{title}</p>
            <p className="text-3xl font-extrabold mt-1">{number}</p>
            <p className="text-sm opacity-90 mt-1">{issueDate}</p>
          </div>
        </div>
      </div>

      <div className="px-12 -mt-8 flex-1 flex flex-col pb-10">
        <div className="grid grid-cols-2 gap-4 mb-8" data-pdf-keep>
          <div className="rounded-2xl bg-white p-5 shadow-md border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: primary }}>{partyLabel('Quote for')}</p>
            <p className="text-lg font-bold text-gray-900">{party.name}</p>
            <div className="text-sm text-gray-500 mt-1 space-y-0.5">{PartyLines}</div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-md border border-gray-100 text-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: primary }}>From</p>
            <p className="font-bold text-gray-900">{company.name}</p>
            <div className="text-gray-500 mt-1 space-y-0.5">
              {company.address && <p>{company.address}</p>}
              {company.tpin && <p>TPIN: {company.tpin}</p>}
              {meta.slice(1).map((m) => <p key={m.l}>{m.l} <span className="font-semibold text-gray-800">{m.v}</span></p>)}
            </div>
          </div>
        </div>

        {Blocks}

        <Table look={{
          tableClass: 'w-full mb-8 border-separate', tableStyle: { borderSpacing: '0 6px' },
          headRowClass: 'text-[11px] font-bold uppercase tracking-widest text-gray-400',
          th: 'px-4 pb-1', labels: { desc: 'Item', price: 'Price' },
          td: (role) => `px-4 py-3 text-sm ${role === 'desc' || role === 'text' ? 'whitespace-pre-wrap' : ''} ${role === 'amount' ? 'font-bold' : ''} ${role === 'num' ? 'text-gray-500' : ''}`,
          cellStyle: () => ({ backgroundColor: cardBg }),
          cellClass: (c, n) => `${c === 0 ? 'rounded-l-xl' : ''} ${c === n - 1 ? 'rounded-r-xl' : ''}`,
        }} />

        {hasSummary && (
          <div className="flex justify-between items-start gap-8" data-pdf-keep>
            <div className="text-sm max-w-xs">
              {bank && (
                <div className="rounded-2xl p-4" style={{ backgroundColor: cardBg }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: primary }}>Bank details</p>
                  <p className="text-gray-600 whitespace-pre-wrap text-xs leading-relaxed">{bank}</p>
                </div>
              )}
            </div>
            {totals && (
              <div className="w-80">
                <TotalsLines className="px-2" />
                <div className="mt-3 rounded-full px-6 py-3.5 flex justify-between items-center shadow-md" style={{ background: gradient, color: onPrimary }}>
                  <span className="text-xs font-bold uppercase tracking-[0.2em]">{totals.grandLabel || 'Total'}</span>
                  <span className="text-2xl font-extrabold">{totals.grand}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {BottomBlock}
      </div>
    </div>
  );

  switch (template) {
    case 'minimal': return Minimal;
    case 'corporate': return Corporate;
    case 'executive': return Executive;
    case 'gradient': return Gradient;
    case 'modern': return Modern;
    case 'elegant': return Elegant;
    case 'bold': return Bold;
    case 'classic':
    default: return Classic;
  }
};

export default BrandDocument;
