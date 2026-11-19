import React from 'react';
import { lines, parseLetterhead } from '../../utils/letterhead';
import { supremeColors } from '../Letterhead/SupremeDocument';

/**
 * A business letter (A4) on the company's letterhead. The letterhead follows
 * the company's document design, so every company's letters look like its
 * own: Classic, Modern, Elegant, Bold, Minimal, Corporate, Executive, Gradient
 * and the Supreme letterhead.
 * Inline styles so html2canvas captures it exactly; the root class
 * `letter-document` is what the PDF generator looks for. Long letters run on
 * to more pages (the PDF generator splits them).
 */

export interface LetterDocData {
  letter_number?: string;
  date?: string;
  reference?: string | null;
  recipient_name?: string | null;
  recipient_title?: string | null;
  recipient_company?: string | null;
  recipient_address?: string | null;
  subject?: string | null;
  salutation?: string | null;
  body?: string | null;
  closing?: string | null;
  signer_name?: string | null;
  signer_title?: string | null;
  signature_url?: string | null;
  show_signature?: boolean | number;
  cc?: string | null;
  enclosures?: string | null;
}

export interface LetterDocCompany {
  name: string;
  address?: string | null;
  tpin?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  template?: string | null;
  /** Supreme letterhead JSON (companies.letterhead). */
  letterhead?: string | null;
  /** Letterhead contact lines JSON for other designs (companies.letter_details). */
  letter_details?: string | null;
}

/** Phone / email / website lines for the letterhead (companies.letter_details). */
export interface LetterDetails { phone?: string; email?: string; website?: string; footer_note?: string }

export const parseLetterDetails = (raw?: string | null): LetterDetails => {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

const isHex = (c?: string | null) => !!c && /^#?[0-9a-f]{6}$/i.test(c);
const hex = (c: string) => `#${c.replace('#', '')}`;
const rgba = (c: string, a: number) => {
  const h = c.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
};
const lum = (c: string) => {
  const h = c.replace('#', '');
  return (0.2126 * parseInt(h.slice(0, 2), 16) + 0.7152 * parseInt(h.slice(2, 4), 16) + 0.0722 * parseInt(h.slice(4, 6), 16)) / 255;
};

export const fmtLetterDate = (d?: string) => {
  if (!d) return '';
  const x = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
  return isNaN(x.getTime()) ? d : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/**
 * The body: paragraphs on blank lines; lines starting "- ", "• " or "1." form
 * a list (also straight after an intro line such as "The quotation covers:").
 */
const BULLET = /^\s*([-•*]|\d+[.)])\s+/;
const Body: React.FC<{ text: string; justify: boolean }> = ({ text, justify }) => {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: React.ReactNode[] = [];
  blocks.forEach((block, i) => {
    // Runs of consecutive text lines / list lines inside the block.
    const runs: { list: boolean; lines: string[] }[] = [];
    block.split('\n').forEach((l) => {
      const list = BULLET.test(l);
      const last = runs[runs.length - 1];
      if (last && last.list === list) last.lines.push(l); else runs.push({ list, lines: [l] });
    });
    runs.forEach((run, k) => {
      const key = `${i}-${k}`;
      const tight = k < runs.length - 1; // an intro line sits right above its list
      if (run.list) {
        const ordered = /^\s*\d+[.)]/.test(run.lines[0]);
        const items = run.lines.map((l) => l.replace(BULLET, ''));
        const style: React.CSSProperties = { margin: tight ? '0 0 4px' : '0 0 12px', paddingLeft: 24 };
        out.push(ordered
          ? <ol key={key} style={{ ...style, listStyleType: 'decimal' }}>{items.map((t, n) => <li key={n} style={{ marginBottom: 3 }}>{t}</li>)}</ol>
          : <ul key={key} style={{ ...style, listStyleType: 'disc' }}>{items.map((t, n) => <li key={n} style={{ marginBottom: 3 }}>{t}</li>)}</ul>);
      } else {
        out.push(
          <p key={key} style={{ margin: tight ? '0 0 4px' : '0 0 12px', whiteSpace: 'pre-wrap', textAlign: justify ? 'justify' : 'left' }}>
            {run.lines.join('\n')}
          </p>
        );
      }
    });
  });
  return <>{out}</>;
};

const LetterDocument: React.FC<{ data: LetterDocData; company: LetterDocCompany; rootClassName?: string }> = ({
  data, company, rootClassName = '',
}) => {
  const template = company.template || 'classic';
  const isSupreme = template === 'supreme';
  const lh = parseLetterhead(company.letterhead);
  const ld = parseLetterDetails(company.letter_details);
  const primary = isSupreme
    ? supremeColors(company, lh).blue
    : isHex(company.primary_color) ? hex(String(company.primary_color)) : '#1f3b5c';
  const accent = isSupreme
    ? supremeColors(company, lh).green
    : isHex(company.secondary_color) && !/^#?f{6}$/i.test(String(company.secondary_color)) ? hex(String(company.secondary_color)) : primary;
  const onPrimary = lum(primary) > 0.62 ? '#111827' : '#ffffff';
  const serifBody = template === 'elegant';
  const font = serifBody ? SERIF : SANS;
  const ink = '#1f2937';

  // Contact details shown on the letterhead and footer.
  const displayName = (isSupreme && lh.display_name) || company.name;
  const addressLines = isSupreme ? [...lines(lh.address_lines)] : lines(company.address);
  const phones = isSupreme ? lines(lh.phones) : lines(ld.phone);
  const email = isSupreme ? lh.email : ld.email;
  const website = isSupreme ? lh.website : ld.website;
  // Leave out details the address already contains (some companies keep their
  // phone and email in the address field).
  const addressText = addressLines.join(' ').toLowerCase();
  const addressDigits = addressText.replace(/\D/g, '');
  const inAddress = (v: string) => {
    const digits = v.replace(/\D/g, '');
    const local = digits.replace(/^265/, '').replace(/^0/, '');
    return addressText.includes(v.toLowerCase()) || (local.length >= 7 && addressDigits.includes(local));
  };
  const contactBits = ([...phones, email, website].filter(Boolean) as string[]).filter((v) => !inAddress(v));
  const footerBits = [addressLines.join(', '), ...contactBits, company.tpin ? `TPIN: ${company.tpin}` : ''].filter(Boolean);

  const Logo: React.FC<{ h: number; w?: number }> = ({ h, w = 300 }) =>
    company.logo_url ? (
      <img src={company.logo_url} alt="" crossOrigin="anonymous" style={{ maxHeight: h, maxWidth: w, objectFit: 'contain', display: 'block' }} />
    ) : (
      <div style={{ fontSize: Math.round(h * 0.38), fontWeight: 800, color: primary, lineHeight: 1.1, fontFamily: font }}>{company.name}</div>
    );

  const ContactLines: React.FC<{ align: 'left' | 'right' | 'center'; color?: string; size?: number }> = ({ align, color = '#4b5563', size = 11.5 }) => (
    <div style={{ textAlign: align, fontSize: size, color, lineHeight: 1.55 }}>
      {addressLines.map((l, i) => <div key={`a${i}`}>{l}</div>)}
      {contactBits.map((l, i) => <div key={`c${i}`}>{l}</div>)}
      {company.tpin && <div>TPIN: {company.tpin}</div>}
    </div>
  );

  /* ------------------------------ letterheads ------------------------------ */
  let header: React.ReactNode;
  let footer: React.ReactNode = (
    <div style={{ borderTop: `1.5px solid ${rgba(primary, 0.5)}`, paddingTop: 8, textAlign: 'center', fontSize: 10.5, color: '#6b7280', lineHeight: 1.5 }}>
      {footerBits.join('   ·   ')}
      {ld.footer_note && <div style={{ marginTop: 2, fontStyle: 'italic' }}>{ld.footer_note}</div>}
    </div>
  );
  let pad = '44px 60px 30px';

  if (isSupreme) {
    pad = '0 0 0';
    header = (
      <div>
        <div style={{ position: 'relative', height: 30 }}>
          <div style={{ position: 'absolute', inset: 0, background: primary }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 210, height: 45, background: accent, opacity: 0.45 }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 125, height: 70, background: accent, opacity: 0.55 }} />
          <div style={{ position: 'absolute', top: 0, right: 125, width: 85, height: 30, background: '#2f6f5a', opacity: 0.55 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '22px 60px 0 64px' }}>
          <div style={{ flex: '0 0 52%' }}>
            <Logo h={88} w={360} />
            <div style={{ height: 2, background: primary, margin: '6px 0 8px 80px', maxWidth: 300 }} />
            <p style={{ margin: '0 0 0 70px', fontWeight: 700, fontSize: 14, color: '#111' }}>{displayName}</p>
            {company.tpin && <p style={{ margin: '2px 0 0 70px', fontWeight: 700, fontSize: 13.5, color: '#111' }}>TPIN: {company.tpin}</p>}
          </div>
          <div style={{ flex: 1, borderLeft: `2px solid ${primary}`, paddingLeft: 8, alignSelf: 'flex-start', color: primary, fontSize: 12.5, lineHeight: 1.45 }}>
            {lines(lh.address_lines).map((l, i) => <div key={`a${i}`}>{l}</div>)}
            {phones.length > 0 && <div style={{ height: 6 }} />}
            {phones.map((l, i) => <div key={`p${i}`} style={{ fontSize: 13.5 }}>{l}</div>)}
            {lh.email && <div style={{ fontSize: 13.5, marginTop: 6 }}>{lh.email}</div>}
            {lh.website && <div>{lh.website}</div>}
            {lh.social && <div style={{ marginTop: 4 }}>{lh.social}</div>}
          </div>
        </div>
      </div>
    );
    footer = (
      <div style={{ position: 'relative', height: 44 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 16, background: primary }} />
        <div style={{ position: 'absolute', right: 0, bottom: 0, width: 125, height: 30, background: '#2f6f5a', opacity: 0.6 }} />
        <div style={{ position: 'absolute', right: 0, bottom: 16, width: 46, height: 28, background: accent, opacity: 0.55 }} />
        {lh.tagline !== '' && (
          <div style={{
            position: 'absolute', left: '22%', bottom: 0, width: '53%', height: 44, background: accent,
            borderRadius: '30px 30px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontFamily: "'Times New Roman', Times, serif", fontSize: 16 }}>{lh.tagline || 'Looking forward to doing Business with you.'}</span>
          </div>
        )}
      </div>
    );
  } else if (template === 'modern') {
    header = (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, background: rgba(primary, 0.07), borderLeft: `6px solid ${primary}`, borderRadius: 10, padding: '18px 22px' }}>
        <div><Logo h={64} /></div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: primary, marginBottom: 2 }}>{company.name}</div>
          <ContactLines align="right" />
        </div>
      </div>
    );
  } else if (template === 'elegant') {
    header = (
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Logo h={70} /></div>
        <div style={{ marginTop: 8, fontFamily: SERIF, fontSize: 17, letterSpacing: 3, textTransform: 'uppercase', color: primary }}>{company.name}</div>
        <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280', fontFamily: SERIF }}>
          {[addressLines.join(', '), ...contactBits].filter(Boolean).join('   ·   ')}
        </div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${primary}`, borderBottom: `1px solid ${primary}`, height: 3 }} />
      </div>
    );
  } else if (template === 'bold') {
    pad = '0 60px 30px';
    header = (
      <div style={{ margin: '0 -60px', background: primary, color: onPrimary, padding: '24px 60px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {company.logo_url && (
            <div style={{ background: '#fff', borderRadius: 10, padding: 8 }}>
              <img src={company.logo_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 54, maxWidth: 200, objectFit: 'contain', display: 'block' }} />
            </div>
          )}
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>{company.name}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11.5, lineHeight: 1.55, opacity: 0.95 }}>
          {addressLines.map((l, i) => <div key={`a${i}`}>{l}</div>)}
          {contactBits.map((l, i) => <div key={`c${i}`}>{l}</div>)}
        </div>
      </div>
    );
  } else if (template === 'minimal') {
    header = (
      <div style={{ paddingBottom: 14, borderBottom: `1px solid ${rgba(primary, 0.6)}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: 1.5, color: '#111827' }}>{company.name}</div>
          {company.logo_url && <Logo h={52} w={220} />}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
          {[addressLines.join(', '), ...contactBits, company.tpin ? `TPIN ${company.tpin}` : ''].filter(Boolean).join('   ·   ')}
        </div>
      </div>
    );
  } else if (template === 'executive') {
    pad = '0 60px 30px';
    header = (
      <div style={{ margin: '0 -60px' }}>
        <div style={{ background: '#1f2937', color: '#fff', padding: '22px 60px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {company.logo_url && (
              <div style={{ background: '#fff', borderRadius: 8, padding: 7 }}>
                <img src={company.logo_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 50, maxWidth: 190, objectFit: 'contain', display: 'block' }} />
              </div>
            )}
            <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: 0.5 }}>{company.name}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, lineHeight: 1.55, color: '#d1d5db' }}>
            {addressLines.map((l, i) => <div key={`a${i}`}>{l}</div>)}
            {contactBits.map((l, i) => <div key={`c${i}`}>{l}</div>)}
          </div>
        </div>
        <div style={{ height: 4, background: primary }} />
      </div>
    );
  } else if (template === 'gradient') {
    pad = '0 60px 30px';
    header = (
      <div style={{
        margin: '0 -60px', padding: '24px 60px 30px', borderRadius: '0 0 36px 36px', color: onPrimary,
        background: `linear-gradient(120deg, ${primary} 0%, ${accent === primary ? rgba(primary, 0.7) : accent} 100%)`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {company.logo_url && (
            <div style={{ background: '#fff', borderRadius: 999, padding: '6px 14px' }}>
              <img src={company.logo_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 46, maxWidth: 180, objectFit: 'contain', display: 'block' }} />
            </div>
          )}
          <div style={{ fontSize: 20, fontWeight: 800 }}>{company.name}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11.5, lineHeight: 1.55, opacity: 0.95 }}>
          {addressLines.map((l, i) => <div key={`a${i}`}>{l}</div>)}
          {contactBits.map((l, i) => <div key={`c${i}`}>{l}</div>)}
        </div>
      </div>
    );
  } else if (template === 'corporate') {
    header = (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, paddingBottom: 14, borderBottom: `3px solid ${primary}` }}>
        <div>
          <Logo h={66} />
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#111827', letterSpacing: 0.3 }}>{company.name}</div>
        </div>
        <ContactLines align="right" />
      </div>
    );
  } else {
    // classic
    header = (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, paddingBottom: 14, borderBottom: `2px solid ${primary}` }}>
        <div><Logo h={72} /></div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{company.name}</div>
          <ContactLines align="right" />
        </div>
      </div>
    );
  }

  /* --------------------------------- letter -------------------------------- */
  const recipient = [data.recipient_name, data.recipient_title, data.recipient_company, ...lines(data.recipient_address)].filter(Boolean) as string[];
  const showSig = data.show_signature !== false && data.show_signature !== 0;
  const inner = isSupreme ? '22px 60px 0 64px' : '0';

  return (
    <div
      className={rootClassName}
      style={{
        position: 'relative', background: '#fff', color: ink, width: '100%', aspectRatio: '210 / 297', boxSizing: 'border-box',
        padding: pad, display: 'flex', flexDirection: 'column', fontFamily: font, fontSize: 13.5, lineHeight: 1.6,
        ...(template === 'corporate' ? { borderLeft: `8px solid ${primary}` } : {}),
      }}
    >
      <div data-pdf-keep>{header}</div>

      <div style={{ padding: inner, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Reference + date */}
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: 13 }} data-pdf-keep>
          <div>
            {data.letter_number && <div><span style={{ color: '#6b7280' }}>Our Ref: </span><strong>{data.letter_number}</strong></div>}
            {data.reference && <div><span style={{ color: '#6b7280' }}>Your Ref: </span>{data.reference}</div>}
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtLetterDate(data.date)}</div>
        </div>

        {/* Recipient */}
        {recipient.length > 0 && (
          <div style={{ marginTop: 22, lineHeight: 1.5 }} data-pdf-keep>
            {recipient.map((l, i) => (
              <div key={i} style={i === 0 ? { fontWeight: 700 } : undefined}>{l}</div>
            ))}
          </div>
        )}

        {/* Salutation + subject */}
        <div style={{ marginTop: 24 }}>{data.salutation || 'Dear Sir/Madam,'}</div>
        {data.subject && (
          <div style={{ margin: '12px 0 4px', fontWeight: 700, textTransform: 'uppercase', textDecoration: 'underline', textUnderlineOffset: 3, letterSpacing: 0.2 }}>
            RE: {data.subject}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {data.body ? <Body text={data.body} justify /> : (
            <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>The letter text appears here…</p>
          )}
        </div>

        {/* Closing + signature */}
        <div style={{ marginTop: 10 }} data-pdf-keep>
          <div>{data.closing || 'Yours faithfully,'}</div>
          <div style={{ height: 70, display: 'flex', alignItems: 'flex-end', margin: '4px 0 2px' }}>
            {showSig && data.signature_url && (
              <img src={data.signature_url} alt="Signature" crossOrigin="anonymous" style={{ maxHeight: 66, maxWidth: 220, objectFit: 'contain', display: 'block' }} />
            )}
          </div>
          <div style={{ width: 220, borderTop: '1px solid #9ca3af', marginBottom: 4 }} />
          {data.signer_name && <div style={{ fontWeight: 700 }}>{data.signer_name}</div>}
          {data.signer_title && <div style={{ color: '#4b5563' }}>{data.signer_title}</div>}
          <div style={{ color: primary, fontWeight: 600 }}>For {displayName}</div>
        </div>

        {(data.enclosures || data.cc) && (
          <div style={{ marginTop: 18, fontSize: 12.5, color: '#4b5563' }} data-pdf-keep>
            {data.enclosures && <div style={{ whiteSpace: 'pre-wrap' }}><strong>Encl.:</strong> {data.enclosures}</div>}
            {data.cc && <div style={{ whiteSpace: 'pre-wrap' }}><strong>cc:</strong> {data.cc}</div>}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 24, ...(isSupreme ? { margin: 'auto -60px 0 -64px' } : {}) }} data-pdf-keep>
          {footer}
        </div>
      </div>
    </div>
  );
};

export default LetterDocument;
