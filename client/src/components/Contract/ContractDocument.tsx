import React from 'react';
import { Contract } from '../../types';
import { formatContractMoney, formatLongDate } from '../../utils/contractTemplate';

const freqText = (f?: string | null): string => {
  const map: Record<string, string> = {
    monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually', 'one-time': 'One-time',
  };
  return map[(f || '').toLowerCase()] || (f || '');
};

/**
 * The printable contract. Rendered with inline styles (not Tailwind) so
 * html2canvas captures it identically in the exported PDF. The root carries the
 * `.contract-document` class that the PDF generator looks for; `data-pdf-keep`
 * marks blocks the page-slicer must not cut through.
 */
const ContractDocument: React.FC<{ contract: Contract }> = ({ contract: c }) => {
  const primary = c.primary_color || '#1f3b5c';
  const currency = c.currency || c.company_currency || 'MWK';
  const effective = formatLongDate(c.effective_date) || formatLongDate(c.start_date);

  const termText = (() => {
    const s = formatLongDate(c.start_date);
    const e = formatLongDate(c.end_date);
    const p = c.contract_period ? String(c.contract_period).trim() : '';
    if (s && e) return `${s} — ${e}${p ? `  (${p})` : ''}`;
    if (s) return `From ${s}${p ? `  (${p})` : ''}`;
    return p || '—';
  })();

  const detailRows: Array<[string, React.ReactNode]> = [];
  if (c.site) detailRows.push(['Site / Location', c.site]);
  if (c.amount ? Number(c.amount) > 0 : false) detailRows.push(['Contract Amount', formatContractMoney(c.amount, currency)]);
  if (c.payment_amount ? Number(c.payment_amount) > 0 : false) {
    detailRows.push(['Payment', `${formatContractMoney(c.payment_amount, currency)}${c.payment_frequency ? `  ·  ${freqText(c.payment_frequency)}` : ''}`]);
  } else if (c.payment_frequency) {
    detailRows.push(['Payment Frequency', freqText(c.payment_frequency)]);
  }
  detailRows.push(['Contract Term', termText]);

  const styles: Record<string, React.CSSProperties> = {
    doc: {
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif",
      color: '#1f2937', background: '#ffffff', width: '100%', maxWidth: 820,
      margin: '0 auto', padding: '48px 56px', boxSizing: 'border-box', lineHeight: 1.6, fontSize: 14,
    },
    title: {
      textAlign: 'center', color: primary, fontSize: 26, fontWeight: 700,
      letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 0 28px',
    },
    intro: { margin: '0 0 24px', color: '#374151' },
    partiesWrap: { borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '18px 0', margin: '0 0 28px' },
    partyRow: { display: 'flex', gap: 16, marginBottom: 12 },
    partyLabel: { width: 110, flexShrink: 0, fontWeight: 700, color: '#4b5563' },
    partyName: { fontWeight: 700, color: '#111827' },
    partyLine: { color: '#4b5563' },
    sectionTitle: { color: primary, fontSize: 16, fontWeight: 700, margin: '22px 0 8px' },
    sectionBody: { whiteSpace: 'pre-wrap', color: '#374151', margin: 0 },
    table: { width: '100%', borderCollapse: 'collapse', margin: '4px 0 8px' },
    tdLabel: {
      width: '34%', background: '#f8fafc', border: '1px solid #e5e7eb',
      padding: '10px 14px', fontWeight: 700, color: '#374151', verticalAlign: 'top',
    },
    tdValue: { border: '1px solid #e5e7eb', padding: '10px 14px', color: '#1f2937', verticalAlign: 'top', whiteSpace: 'pre-wrap' },
    signWrap: { display: 'flex', gap: 48, marginTop: 40 },
    signCol: { flex: 1 },
    signLine: { borderBottom: '1px solid #9ca3af', height: 40, marginBottom: 6 },
    signCap: { fontSize: 12, color: '#6b7280' },
    signField: { fontSize: 13, color: '#374151', marginTop: 14 },
  };

  return (
    <div className="contract-document" style={styles.doc}>
      <h1 style={styles.title}>{c.title || 'Service Contract'}</h1>

      <p style={styles.intro}>
        This {c.title || 'Agreement'} (the &ldquo;Agreement&rdquo;) is entered into and made effective as of{' '}
        <strong>{effective || '____________'}</strong>, by and between the following parties:
      </p>

      {/* Parties */}
      <div style={styles.partiesWrap} data-pdf-keep>
        <div style={styles.partyRow}>
          <div style={styles.partyLabel}>Client:</div>
          <div>
            <div style={styles.partyName}>{c.client_name}</div>
            {c.client_address && <div style={styles.partyLine}>{c.client_address}</div>}
            {(c.client_email || c.client_phone) && (
              <div style={styles.partyLine}>{[c.client_email, c.client_phone].filter(Boolean).join('  ·  ')}</div>
            )}
          </div>
        </div>
        <div style={{ ...styles.partyRow, marginBottom: 0 }}>
          <div style={styles.partyLabel}>Company:</div>
          <div>
            <div style={styles.partyName}>{c.company_name}</div>
            {c.company_address && <div style={styles.partyLine}>{c.company_address}</div>}
            {c.company_tpin && <div style={styles.partyLine}>TPIN: {c.company_tpin}</div>}
          </div>
        </div>
      </div>

      {/* Key details table */}
      <div data-pdf-keep>
        <table style={styles.table}>
          <tbody>
            {detailRows.map(([label, value], i) => (
              <tr key={i}>
                <td style={styles.tdLabel}>{label}</td>
                <td style={styles.tdValue}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Clause sections */}
      {(c.sections || []).map((s, i) => (
        <div key={i} data-pdf-keep>
          <div style={styles.sectionTitle}>{i + 1}. {s.heading}</div>
          <p style={styles.sectionBody}>{s.body}</p>
        </div>
      ))}

      {/* Execution + signatures */}
      <div data-pdf-keep>
        <p style={{ ...styles.sectionBody, marginTop: 26 }}>
          IN WITNESS WHEREOF, the parties hereto have executed this {c.title || 'Agreement'} as of the date first written above.
        </p>
        <div style={styles.signWrap}>
          <div style={styles.signCol}>
            <div style={{ fontWeight: 700, marginBottom: 28, color: '#111827' }}>For Client ({c.client_name})</div>
          <div style={styles.signLine} />
          <div style={styles.signCap}>Authorized Signature</div>
          <div style={styles.signField}>Name: ____________________________</div>
          <div style={styles.signField}>Title: _____________________________</div>
          <div style={styles.signField}>Date: _____________________________</div>
        </div>
        <div style={styles.signCol}>
          <div style={{ fontWeight: 700, marginBottom: 28, color: '#111827' }}>For Company ({c.company_name})</div>
          <div style={styles.signLine} />
          <div style={styles.signCap}>Authorized Signature</div>
          <div style={styles.signField}>Name: ____________________________</div>
          <div style={styles.signField}>Title: _____________________________</div>
          <div style={styles.signField}>Date: _____________________________</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractDocument;
