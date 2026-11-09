import React from 'react';
import { AccountLedger } from '../../services/accountsApi';
import { formatCurrency, formatNumber } from '../../utils/calculations';
import { hexToRgb, rgbToHex } from '../../utils/colors';
import { parseLetterhead, lines } from '../../utils/letterhead';

/**
 * Printable statement for one money account (bank, mobile money, cash or
 * petty cash): money in, money out and the running balance for a period,
 * branded like the client statement. Inline styles so html2canvas captures it
 * exactly; `rootClassName` is what the PDF generator looks for.
 */

const HEX = /^#[0-9a-f]{6}$/i;
const luma = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const darken = (hex: string, amount: number) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
};

export const fmtLedgerDate = (d?: string | null) => {
  if (!d) return '';
  const x = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
  return isNaN(x.getTime()) ? d : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

interface Props {
  ledger: AccountLedger;
  rootClassName?: string;
}

const AccountStatementDocument: React.FC<Props> = ({ ledger: L, rootClassName = '' }) => {
  const co = L.company || {};
  const acc = L.account;
  const currency = co.currency || undefined;
  const money = (n: number) => formatNumber(Number(n || 0));

  const brand = co.primary_color && HEX.test(co.primary_color) ? co.primary_color : '#1f3b5c';
  const onBrand = luma(brand) > 0.62 ? '#111827' : '#ffffff';
  const brandText = luma(brand) > 0.5 ? darken(brand, 0.42) : brand;
  const accent = co.secondary_color && HEX.test(co.secondary_color) && luma(co.secondary_color) < 0.9 ? co.secondary_color : brand;

  const logo = co.quote_logo_url || co.logo_url || null;
  const lh = parseLetterhead(co.letterhead);
  const isLetterhead = co.template === 'supreme';
  const contactLines = isLetterhead
    ? [...lines(lh.address_lines), lines(lh.phones).join('  |  '), [lh.email, lh.website].filter(Boolean).join('  |  ')].filter(Boolean)
    : lines(co.address);
  const displayName = (isLetterhead && lh.display_name) || co.name || '';
  const periodText = L.from || L.to
    ? `${L.from ? fmtLedgerDate(L.from) : 'Start'} – ${fmtLedgerDate(L.to || new Date().toISOString().slice(0, 10))}`
    : 'All transactions';

  const s: Record<string, React.CSSProperties> = {
    root: {
      background: '#fff', color: '#1f2937', width: '100%', boxSizing: 'border-box',
      padding: '46px 48px 32px', fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", fontSize: 13, lineHeight: 1.45,
      display: 'flex', flexDirection: 'column',
      backgroundImage: `linear-gradient(90deg, ${brand} 0%, ${brand} 75%, ${accent} 75%, ${accent} 100%)`,
      backgroundSize: '100% 6px', backgroundRepeat: 'no-repeat', backgroundPosition: 'top left',
    },
    label: { fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: '#6b7280', margin: '0 0 4px' },
    th: { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: onBrand, background: brand, textAlign: 'left', whiteSpace: 'nowrap' },
    td: { padding: '8px 10px', borderBottom: '1px solid #eef0f3', verticalAlign: 'top' },
    num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  };

  const accountLines = [
    acc.type_name,
    acc.bank_name && acc.bank_name !== acc.name ? acc.bank_name : '',
    acc.branch ? `Branch: ${acc.branch}` : '',
    acc.account_number ? `${acc.type === 'mobile' ? 'Number' : 'Account no.'}: ${acc.account_number}` : '',
  ].filter(Boolean);

  return (
    <div className={rootClassName} style={s.root}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }} data-pdf-keep>
        <div style={{ maxWidth: '58%' }}>
          {logo ? (
            <img src={logo} alt="" crossOrigin="anonymous" style={{ maxHeight: 72, maxWidth: 260, objectFit: 'contain', display: 'block' }} />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 800, color: brandText }}>{displayName}</div>
          )}
          <div style={{ marginTop: 10, fontSize: 11.5, color: '#4b5563', lineHeight: 1.5 }}>
            {logo && <div style={{ fontWeight: 700, color: '#111827', fontSize: 12.5 }}>{displayName}</div>}
            {contactLines.map((l, i) => <div key={i}>{l}</div>)}
            {co.tpin && <div>TPIN: {co.tpin}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: brandText, letterSpacing: 0.8, lineHeight: 1.15 }}>ACCOUNT</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', letterSpacing: 1.5, textTransform: 'uppercase' }}>statement</div>
          <table style={{ marginTop: 12, marginLeft: 'auto', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {[
                ['Printed', fmtLedgerDate(new Date().toISOString().slice(0, 10))],
                ['Period', periodText],
                ['Currency', (currency || 'MWK').toUpperCase()],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '2px 10px 2px 0', color: '#6b7280', textAlign: 'right' }}>{k}</td>
                  <td style={{ padding: '2px 0', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 24 }} data-pdf-keep>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px' }}>
          <p style={s.label}>Account</p>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{acc.name}</div>
          {accountLines.map((l) => <div key={l} style={{ color: '#4b5563' }}>{l}</div>)}
          {!acc.is_active && <div style={{ color: '#b91c1c', fontWeight: 600 }}>Closed</div>}
        </div>
        <div style={{ borderRadius: 10, padding: '12px 16px', background: brand, color: onBrand, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', opacity: 0.85 }}>Closing balance</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(L.closing, currency)}</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>as at {fmtLedgerDate(L.to || new Date().toISOString().slice(0, 10))}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }} data-pdf-keep>
        {[
          ['Opening balance', L.opening, '#111827'],
          ['Money in', L.total_in, '#047857'],
          ['Money out', L.total_out, '#b91c1c'],
          ['Closing balance', L.closing, L.closing < -0.004 ? '#b91c1c' : '#111827'],
        ].map(([label, val, color], i) => (
          <div key={label as string} style={{ padding: '10px 14px', borderLeft: i ? '1px solid #e5e7eb' : 'none', background: i === 3 ? '#f9fafb' : '#fff' }}>
            <div style={{ fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{label as string}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: color as string, fontVariantNumeric: 'tabular-nums' }}>{money(val as number)}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 96, borderTopLeftRadius: 6 }}>Date</th>
              <th style={{ ...s.th, width: 110 }}>Reference</th>
              <th style={s.th}>Description</th>
              <th style={{ ...s.th, ...s.num, width: 105 }}>Money in</th>
              <th style={{ ...s.th, ...s.num, width: 105 }}>Money out</th>
              <th style={{ ...s.th, ...s.num, width: 115, borderTopRightRadius: 6 }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#f9fafb' }}>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{L.from ? fmtLedgerDate(L.from) : fmtLedgerDate(acc.opening_date)}</td>
              <td style={s.td} />
              <td style={{ ...s.td, fontWeight: 600 }}>{L.from ? 'Balance brought forward' : 'Opening balance'}</td>
              <td style={s.td} />
              <td style={s.td} />
              <td style={{ ...s.td, ...s.num, fontWeight: 600 }}>{money(L.opening)}</td>
            </tr>
            {L.lines.length === 0 ? (
              <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#9ca3af', padding: '18px 10px' }}>No money in or out in this period.</td></tr>
            ) : L.lines.map((e, i) => (
              <tr key={i} style={{ background: i % 2 ? '#fcfcfd' : '#fff' }}>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtLedgerDate(e.date)}</td>
                <td style={{ ...s.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{e.number || e.reference || ''}</td>
                <td style={s.td}>
                  {e.description}
                  {e.reference && e.number && <span style={{ color: '#9ca3af' }}> · Ref {e.reference}</span>}
                </td>
                <td style={{ ...s.td, ...s.num, color: '#047857' }}>{e.dir === 'in' ? money(e.amount) : ''}</td>
                <td style={{ ...s.td, ...s.num, color: '#b91c1c' }}>{e.dir === 'out' ? money(e.amount) : ''}</td>
                <td style={{ ...s.td, ...s.num, fontWeight: 600, color: e.balance < -0.004 ? '#b91c1c' : undefined }}>{money(e.balance)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} style={{ padding: '10px', fontWeight: 700, borderTop: `2px solid ${brand}`, textAlign: 'right', letterSpacing: 0.4 }}>CLOSING BALANCE</td>
              <td style={{ padding: '10px', ...s.num, fontWeight: 700, borderTop: `2px solid ${brand}`, color: '#047857' }}>{money(L.total_in)}</td>
              <td style={{ padding: '10px', ...s.num, fontWeight: 700, borderTop: `2px solid ${brand}`, color: '#b91c1c' }}>{money(L.total_out)}</td>
              <td style={{ padding: '10px', ...s.num, fontWeight: 800, borderTop: `2px solid ${brand}`, color: brandText }}>{money(L.closing)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 26 }} data-pdf-keep>
        <div style={{ paddingTop: 8, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
          <span>{displayName}</span>
          <span>{acc.name} · {periodText}</span>
        </div>
      </div>
    </div>
  );
};

export default AccountStatementDocument;
