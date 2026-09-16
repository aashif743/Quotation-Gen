import React from 'react';
import { Contract, ContractSection } from '../../types';
import { formatContractMoney, formatLongDate } from '../../utils/contractTemplate';

const freqText = (f?: string | null): string => {
  const map: Record<string, string> = {
    monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually', 'one-time': 'One-time',
  };
  return map[(f || '').toLowerCase()] || (f || '');
};

// Split a clause body into paragraphs so the PDF page-slicer can break BETWEEN
// paragraphs (never mid-line). Blank lines separate paragraphs.
const toParagraphs = (body: string): string[] =>
  String(body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

/**
 * The printable contract. Rendered with inline styles (not Tailwind) so
 * html2canvas captures it identically in the exported PDF. The root carries the
 * `.contract-document` class that the PDF generator looks for; `data-pdf-keep`
 * marks blocks the page-slicer must not cut through, and every <p> is a safe
 * break boundary.
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
  if (Number(c.amount) > 0) detailRows.push(['Contract Amount', formatContractMoney(c.amount, currency)]);
  if (Number(c.payment_amount) > 0) {
    detailRows.push(['Payment', `${formatContractMoney(c.payment_amount, currency)}${c.payment_frequency ? `  ·  ${freqText(c.payment_frequency)}` : ''}`]);
  } else if (c.payment_frequency) {
    detailRows.push(['Payment Frequency', freqText(c.payment_frequency)]);
  }
  if (Number(c.insurance) > 0) detailRows.push(['Insurance', formatContractMoney(c.insurance, currency)]);
  if (Number(c.printing_charges) > 0) detailRows.push(['Printing / Production Charges', formatContractMoney(c.printing_charges, currency)]);
  detailRows.push(['Contract Term', termText]);

  // Generic clauses + per-contract termination / comments as their own sections.
  const allSections: ContractSection[] = [...(c.sections || [])];
  if (c.termination_rules && String(c.termination_rules).trim()) {
    allSections.push({ heading: 'Early Termination & Removal Fees', body: String(c.termination_rules).trim() });
  }
  if (c.comments && String(c.comments).trim()) {
    allSections.push({ heading: 'Additional Terms', body: String(c.comments).trim() });
  }

  const s: Record<string, React.CSSProperties> = {
    doc: {
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif",
      color: '#1f2937', background: '#ffffff', width: '100%', maxWidth: 820,
      margin: '0 auto', padding: '44px 56px', boxSizing: 'border-box', lineHeight: 1.6, fontSize: 14,
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 16, borderBottom: `2px solid ${primary}`, marginBottom: 26 },
    logo: { maxHeight: 64, maxWidth: 220, objectFit: 'contain' },
    coName: { fontSize: 18, fontWeight: 700, color: primary, margin: 0 },
    coLine: { fontSize: 12, color: '#6b7280', margin: 0 },
    title: { textAlign: 'center', color: primary, fontSize: 24, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 0 22px' },
    intro: { margin: '0 0 22px', color: '#374151' },
    partiesWrap: { borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '18px 0', margin: '0 0 26px' },
    partyRow: { display: 'flex', gap: 16, marginBottom: 12 },
    partyLabel: { width: 110, flexShrink: 0, fontWeight: 700, color: '#4b5563' },
    partyName: { fontWeight: 700, color: '#111827' },
    partyLine: { color: '#4b5563' },
    sectionTitle: { color: primary, fontSize: 15, fontWeight: 700, margin: '20px 0 6px' },
    para: { whiteSpace: 'pre-wrap', color: '#374151', margin: '0 0 8px' },
    table: { width: '100%', borderCollapse: 'collapse', margin: '4px 0 8px' },
    tdLabel: { width: '34%', background: '#f8fafc', border: '1px solid #e5e7eb', padding: '10px 14px', fontWeight: 700, color: '#374151', verticalAlign: 'top' },
    tdValue: { border: '1px solid #e5e7eb', padding: '10px 14px', color: '#1f2937', verticalAlign: 'top', whiteSpace: 'pre-wrap' },
    signWrap: { display: 'flex', gap: 48, marginTop: 24 },
    signCol: { flex: 1 },
    signImgBox: { height: 56, display: 'flex', alignItems: 'flex-end', marginBottom: 2 },
    signImg: { maxHeight: 56, maxWidth: 200, objectFit: 'contain' },
    signLine: { borderBottom: '1px solid #9ca3af', height: 2, marginBottom: 6 },
    signCap: { fontSize: 12, color: '#6b7280' },
    signField: { fontSize: 13, color: '#374151', marginTop: 12 },
  };

  return (
    <div className="contract-document" style={s.doc}>
      {/* Company logo header */}
      <div style={s.header} data-pdf-keep>
        <div>
          <p style={s.coName}>{c.company_name}</p>
          {c.company_address && <p style={s.coLine}>{c.company_address}</p>}
          {c.company_tpin && <p style={s.coLine}>TPIN: {c.company_tpin}</p>}
        </div>
        {c.company_logo ? <img src={c.company_logo} alt="" style={s.logo} crossOrigin="anonymous" /> : null}
      </div>

      <h1 style={s.title}>{c.title || 'Service Contract'}</h1>

      <p style={s.intro}>
        This {c.title || 'Agreement'} (the &ldquo;Agreement&rdquo;) is entered into and made effective as of{' '}
        <strong>{effective || '____________'}</strong>, by and between the following parties:
      </p>

      {/* Parties */}
      <div style={s.partiesWrap} data-pdf-keep>
        <div style={s.partyRow}>
          <div style={s.partyLabel}>Client:</div>
          <div>
            <div style={s.partyName}>{c.client_name}</div>
            {c.client_address && <div style={s.partyLine}>{c.client_address}</div>}
            {(c.client_email || c.client_phone) && (
              <div style={s.partyLine}>{[c.client_email, c.client_phone].filter(Boolean).join('  ·  ')}</div>
            )}
          </div>
        </div>
        <div style={{ ...s.partyRow, marginBottom: 0 }}>
          <div style={s.partyLabel}>Company:</div>
          <div>
            <div style={s.partyName}>{c.company_name}</div>
            {c.company_address && <div style={s.partyLine}>{c.company_address}</div>}
          </div>
        </div>
      </div>

      {/* Key details table */}
      <div data-pdf-keep data-pdf-break-before>
        <table style={s.table}>
          <tbody>
            {detailRows.map(([label, value], i) => (
              <tr key={i}>
                <td style={s.tdLabel}>{label}</td>
                <td style={s.tdValue}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Clauses. The heading is a "break-before" point so a clause that doesn't
          fit is pushed whole to the next page. Bodies are plain <p> (NOT inside
          a keep block) so the PDF slicer can break between their visual lines —
          text is never sliced mid-line. A heading isn't orphaned because the
          first break after it can only fall after the first body line. */}
      {allSections.map((sec, i) => {
        const paras = toParagraphs(sec.body);
        return (
          <React.Fragment key={i}>
            <div style={s.sectionTitle} data-pdf-break-before>{i + 1}. {sec.heading}</div>
            {paras.map((p, j) => <p key={j} style={{ ...s.para, marginTop: j === 0 ? 0 : 8 }}>{p}</p>)}
          </React.Fragment>
        );
      })}

      {/* Execution + signatures */}
      <div data-pdf-keep data-pdf-break-before>
        <p style={{ ...s.para, marginTop: 24 }}>
          IN WITNESS WHEREOF, the parties hereto have executed this {c.title || 'Agreement'} as of the date first written above.
        </p>
        <div style={s.signWrap}>
          <div style={s.signCol}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: '#111827' }}>For Client ({c.client_name})</div>
            <div style={s.signImgBox} />
            <div style={s.signLine} />
            <div style={s.signCap}>Authorized Signature</div>
            <div style={s.signField}>Name: ____________________________</div>
            <div style={s.signField}>Title: _____________________________</div>
            <div style={s.signField}>Date: _____________________________</div>
          </div>
          <div style={s.signCol}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: '#111827' }}>For Company ({c.company_name})</div>
            <div style={s.signImgBox}>
              {c.signature_url ? <img src={c.signature_url} alt="Signature" style={s.signImg} crossOrigin="anonymous" /> : null}
            </div>
            <div style={s.signLine} />
            <div style={s.signCap}>Authorized Signature</div>
            <div style={s.signField}>Name: ____________________________</div>
            <div style={s.signField}>Title: _____________________________</div>
            <div style={s.signField}>Date: _____________________________</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractDocument;
