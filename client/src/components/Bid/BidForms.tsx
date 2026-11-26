import React from 'react';
import { amountInWords } from '../../utils/amountInWords';
import { lines } from '../../utils/letterhead';
import LetterDocument, { LetterDocCompany } from '../Letter/LetterDocument';
import { BidData, BidProfile, bidTotals, lineTotal } from '../../services/bidsApi';

/**
 * The bid's forms, each an A4 page (or more) with inline styles so
 * html2canvas captures it exactly. Everything is filled from ONE place — the
 * Bid Profile, what was read from the tender and the price schedule — so the
 * amounts, words, reference numbers and names are the same on every form.
 */

export interface BidFormContext {
  data: BidData;
  profile: BidProfile;
  bidNumber: string;
  company: LetterDocCompany & { currency?: string | null };
  signatureUrl?: string | null;
}

const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";
const ink = '#111827';

export const fmtLongDate = (d?: string) => {
  if (!d) return '';
  const x = /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(`${d.slice(0, 10)}T00:00:00`) : new Date(d);
  return isNaN(x.getTime()) ? d : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};
const money = (n: number, code = 'MWK') =>
  `${code} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "MWK 2,530,000,000.00 (Two Billion … Kwacha Only)" */
export const moneyWithWords = (n: number, code = 'MWK') => `${money(n, code)} (${amountInWords(n, code)})`;

const currencyCode = (ctx: BidFormContext) => {
  const c = String(ctx.company.currency || 'MWK').toUpperCase();
  return /kwacha/i.test(ctx.data.tender?.currency || '') ? 'MWK' : c;
};

/* --------------------------------- pieces --------------------------------- */

const Page: React.FC<{ form: string; children: React.ReactNode }> = ({ form, children }) => (
  <div
    className="bid-form"
    data-form={form}
    style={{
      background: '#fff', color: ink, width: '100%', aspectRatio: '210 / 297', boxSizing: 'border-box',
      padding: '52px 60px 44px', display: 'flex', flexDirection: 'column', fontFamily: SANS, fontSize: 13, lineHeight: 1.55,
    }}
  >
    {children}
  </div>
);

const Title: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div style={{ textAlign: 'center', marginBottom: 18 }} data-pdf-keep>
    <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>{children}</div>
    {sub && <div style={{ fontSize: 12, color: '#4b5563', marginTop: 3 }}>{sub}</div>}
  </div>
);

const Meta: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <table style={{ borderCollapse: 'collapse', marginBottom: 14 }} data-pdf-keep>
    <tbody>
      {rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([l, v]) => (
        <tr key={l}>
          <td style={{ padding: '2px 14px 2px 0', color: '#4b5563', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{l}</td>
          <td style={{ padding: '2px 0', fontWeight: 600 }}>{v}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const To: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const addr = lines(ctx.data.tender?.addressee || ctx.data.tender?.procuring_entity || '');
  if (!addr.length) return null;
  return (
    <div style={{ marginBottom: 14, display: 'flex', gap: 14 }} data-pdf-keep>
      <span style={{ color: '#4b5563' }}>To:</span>
      <div style={{ fontWeight: 600 }}>{addr.map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
};

const P: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <p style={{ margin: '0 0 9px', textAlign: 'justify', ...style }}>{children}</p>
);

const List: React.FC<{ items: React.ReactNode[]; type?: 'a' | '1' | 'disc' }> = ({ items, type = 'a' }) => {
  const style: React.CSSProperties = { margin: '0 0 10px', paddingLeft: 26, listStyleType: type === 'a' ? 'lower-alpha' : type === '1' ? 'decimal' : 'disc' };
  return <ol style={style}>{items.map((it, i) => <li key={i} style={{ marginBottom: 6, textAlign: 'justify', paddingLeft: 4 }}>{it}</li>)}</ol>;
};

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>;

const th: React.CSSProperties = { border: '1px solid #374151', padding: '6px 8px', background: '#f3f4f6', fontWeight: 700, fontSize: 11.5, textAlign: 'left', verticalAlign: 'top' };
const td: React.CSSProperties = { border: '1px solid #374151', padding: '6px 8px', fontSize: 12, verticalAlign: 'top' };

/** "Authorised by" block with signature, as on every standard form. */
const SignBlock: React.FC<{ ctx: BidFormContext; variant?: 'authorised' | 'declaration' }> = ({ ctx, variant = 'authorised' }) => {
  const p = ctx.profile;
  const date = fmtLongDate(ctx.data.options?.bid_date);
  const showSig = ctx.data.options?.show_signature !== false && !!ctx.signatureUrl;
  const sig = (
    <div style={{ height: 54, display: 'flex', alignItems: 'flex-end' }}>
      {showSig && <img src={ctx.signatureUrl!} alt="" crossOrigin="anonymous" style={{ maxHeight: 50, maxWidth: 190, objectFit: 'contain' }} />}
    </div>
  );
  const address = [p.physical_address, p.postal_address].filter(Boolean).join(', ').replace(/\n/g, ', ');
  if (variant === 'declaration') {
    return (
      <div style={{ marginTop: 18 }} data-pdf-keep>
        <div style={{ display: 'flex', gap: 30, alignItems: 'flex-end' }}>
          <div><div style={{ color: '#4b5563' }}>Signed:</div>{sig}<div style={{ width: 200, borderTop: '1px solid #6b7280' }} /></div>
          <div>In the capacity of <B>{p.signatory_title || '________________'}</B></div>
        </div>
        <div style={{ marginTop: 8 }}>Name: <B>{p.signatory_name || '________________'}</B></div>
        <div>Duly authorised to sign the Bid for and on behalf of: <B>{p.legal_name}</B></div>
        <div>Dated: <B>{date}</B></div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 18 }} data-pdf-keep>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Authorised by:</div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', paddingRight: 20, verticalAlign: 'bottom' }}>
              <div style={{ color: '#4b5563', fontSize: 12 }}>Signature</div>
              {sig}
              <div style={{ borderTop: '1px solid #6b7280' }} />
            </td>
            <td style={{ verticalAlign: 'bottom' }}>
              <div><span style={{ color: '#4b5563' }}>Name: </span><B>{p.signatory_name}</B></div>
              <div><span style={{ color: '#4b5563' }}>Position: </span><B>{p.signatory_title}</B></div>
              <div><span style={{ color: '#4b5563' }}>Date: </span><B>{date}</B></div>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}><span style={{ color: '#4b5563' }}>Authorised for and on behalf of: </span><B>{p.legal_name}</B></div>
      {address && <div><span style={{ color: '#4b5563' }}>Registered address: </span>{address}</div>}
    </div>
  );
};

/* ---------------------------------- forms --------------------------------- */

export const defaultCoverBody = (data: BidData, profile: BidProfile, docLabels: string[]) => {
  const t = data.tender || {};
  const o = data.options || {};
  const isRfq = data.kind === 'rfq';
  const lines2 = [
    `We, ${profile.legal_name || '[company name]'}, are pleased to submit our ${isRfq ? 'quotation' : 'bid'} in response to your ${isRfq ? 'request for quotation' : 'invitation for bids'} for ${t.title || 'the above'}${t.reference_number ? ` (Procurement Reference Number ${t.reference_number})` : ''}.`,
    `We have examined the ${isRfq ? 'request' : 'Bidding Documents'} and offer to supply in full conformity with your requirements. Our commercial terms are:\n- Bid validity: ${o.validity_days || profile.validity_days || 120} days\n- Payment terms: ${o.payment_terms || profile.payment_terms || '[payment terms]'}\n- Delivery: ${o.delivery || profile.delivery || t.delivery_period || '[delivery period]'}${o.warranty || profile.warranty ? `\n- Warranty: ${o.warranty || profile.warranty}` : ''}`,
  ];
  if (docLabels.length) lines2.push(`In support of our ${isRfq ? 'quotation' : 'bid'}, we enclose the following:\n${docLabels.map((l) => `- ${l}`).join('\n')}`);
  lines2.push('We trust that our submission meets your requirements and look forward to your favourable consideration.');
  return lines2.join('\n\n');
};

const CoverLetter: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const t = ctx.data.tender || {};
  const o = ctx.data.options || {};
  const addr = lines(t.addressee || t.procuring_entity || '');
  return (
    <div className="bid-form" data-form="cover_letter">
      <LetterDocument
        company={ctx.company}
        data={{
          letter_number: ctx.bidNumber,
          date: o.bid_date,
          reference: t.reference_number || '',
          recipient_name: addr[0] || '',
          recipient_address: addr.slice(1).join('\n'),
          subject: o.cover_subject || `${ctx.data.kind === 'rfq' ? 'Quotation' : 'Bid'} for ${t.title || ''}`.trim(),
          salutation: 'Dear Sir/Madam,',
          body: o.cover_body || '',
          closing: 'Yours faithfully,',
          signer_name: ctx.profile.signatory_name,
          signer_title: ctx.profile.signatory_title,
          signature_url: ctx.signatureUrl,
          show_signature: o.show_signature !== false,
        }}
      />
    </div>
  );
};

const BidSubmissionSheet: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const t = ctx.data.tender || {};
  const o = ctx.data.options || {};
  const p = ctx.profile;
  const cur = currencyCode(ctx);
  const total = bidTotals(ctx.data).grand;
  const pct = Number(t.performance_security_percent) || 0;
  const perf = pct > 0 ? `${moneyWithWords(Math.round(total * pct) / 100, cur)}, being ${pct}% of the contract price` : (t.performance_security || 'the amount required in the Bidding Documents');
  const commissions = (o.commissions || []).filter((c) => c.name);
  const directors = (p.directors || []).filter((d) => d.name);
  return (
    <Page form="bid_submission_sheet">
      <Title>Bid Submission Sheet</Title>
      <Meta rows={[
        ['Date:', fmtLongDate(o.bid_date)],
        ['Procurement Reference Number:', t.reference_number],
        ['Alternative No.:', o.alternative_no || 'N/A'],
      ]} />
      <To ctx={ctx} />
      <P>We, the undersigned, declare that:</P>
      <List items={[
        <>We have examined and have no reservations to the Bidding Documents, including Addenda No: <B>{o.addenda || 'N/A'}</B>;</>,
        <>We offer to supply in conformity with the Bidding Documents and in accordance with the delivery schedule specified in the Statement of Requirements the following goods and related services: <B>{t.title}</B>;</>,
        <>The total price of our Bid, excluding any discounts offered in item (d) below{o.prices_include ? `, ${o.prices_include}` : ''}, is: <B>{moneyWithWords(total, cur)}</B>;</>,
        <>The discounts offered and the methodology for their application are: <B>{o.discounts || 'N/A'}</B>{o.discounts ? <>. Methodology of application: <B>{o.discount_method || 'N/A'}</B></> : null};</>,
        <>Our Bid shall be valid for a period of <B>{o.validity_days || p.validity_days || ''} days</B> from the date fixed for the Bid submission deadline in accordance with the Bidding Documents, and it shall remain binding upon us and may be accepted at any time before expiry of that period;</>,
        'We, including any subcontractors for any part of the contract resulting from this procurement process, are eligible to participate in public procurement in accordance with clause 4.1 of the ITB and have not been suspended by the Public Procurement and Disposal of Assets Authority in Malawi from participating in public procurement;',
        'We, including any subcontractors for any part of the contract resulting from this procurement process, have not been suspended by the Authority or any of the cooperating partners or any oversight institution with which the Authority has entered a cross-debarment agreement;',
        'Our firm, its affiliates or subsidiaries, including subcontractors or suppliers for any part of the contract, are not under investigation by the Anti-Corruption Bureau or any other law enforcement body in Malawi relating to participation in any public procurement tender exercise or execution of any public procurement contract;',
        'We are not participating, as Bidders, in more than one Bid in this Bidding process, other than alternative Bids in accordance with the Bidding Document;',
        'We do not have any conflict of interest and have not participated in the preparation of the original Statement of Requirements for the Procuring and Disposing Entity;',
        <>If our Bid is accepted, we commit to obtain a performance security in accordance with the Bidding Documents, in the amount of <B>{perf}</B>, for the due performance of the Contract;</>,
        <>We, including any subcontractors or suppliers for any part of the Contract, have nationalities from eligible countries: <B>{o.nationality || p.nationality || ''}</B>;</>,
        <>The following commissions, gratuities, or fees have been paid or are to be paid with respect to the Bidding process or execution of the Contract:
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '6px 0' }}>
            <thead><tr><th style={th}>Name of recipient</th><th style={th}>Address</th><th style={th}>Reason</th><th style={th}>Amount</th></tr></thead>
            <tbody>
              {commissions.length ? commissions.map((c, i) => (
                <tr key={i}><td style={td}>{c.name}</td><td style={td}>{c.address}</td><td style={td}>{c.reason}</td><td style={td}>{c.amount}</td></tr>
              )) : <tr><td style={td}>None</td><td style={td}>None</td><td style={td}>None</td><td style={td}>None</td></tr>}
            </tbody>
          </table>
        </>,
        <>The names and physical addresses of the Directors of our firm are:
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '6px 0' }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Address</th></tr></thead>
            <tbody>{(directors.length ? directors : [{ name: '', address: '' }]).map((d, i) => <tr key={i}><td style={td}>{d.name}</td><td style={td}>{d.address}</td></tr>)}</tbody>
          </table>
        </>,
        'We confirm that a Manufacturer’s Inspection Certificate or Works Inspection Certificate will be provided for all items if we are awarded the contract;',
        <>The commercial warranty for quality and performance of the goods offered will be <B>{o.warranty || p.warranty || 'as required in the Bidding Documents'}</B>; and</>,
        'We understand that you are not bound to accept the lowest evaluated Bid or any other Bid that you may receive.',
      ]} />
      <SignBlock ctx={ctx} />
    </Page>
  );
};

const PriceSchedule: React.FC<{ ctx: BidFormContext; quotation?: boolean }> = ({ ctx, quotation }) => {
  const t = ctx.data.tender || {};
  const o = ctx.data.options || {};
  const cur = currencyCode(ctx);
  const tot = bidTotals(ctx.data);
  const items = ctx.data.items || [];
  const lots = Array.from(new Set(items.map((i) => i.lot || '')));
  const showOrigin = !quotation;
  return (
    <Page form={quotation ? 'quotation' : 'price_schedule'}>
      <Title sub={quotation ? undefined : 'Goods and Related Services'}>{quotation ? 'Quotation' : 'Price Schedule'}</Title>
      <Meta rows={[
        ['Date:', fmtLongDate(o.bid_date)],
        ['Procurement Reference Number:', t.reference_number],
        ['Name of the Bidder:', ctx.profile.legal_name],
        ...(quotation ? [['To:', lines(t.addressee || t.procuring_entity || '').join(', ')] as [string, React.ReactNode]] : []),
      ]} />
      {lots.filter(Boolean).length > 0 && <div style={{ fontWeight: 700, marginBottom: 6 }}>{lots.filter(Boolean).join(' · ')}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }} data-pdf-keep>
        <thead>
          <tr>
            <th style={{ ...th, width: 44 }}>Item</th>
            <th style={th}>Description of goods / related services</th>
            {showOrigin && <th style={{ ...th, width: 90 }}>Country of origin</th>}
            <th style={{ ...th, width: 70, textAlign: 'right' }}>Quantity</th>
            <th style={{ ...th, width: 110, textAlign: 'right' }}>Unit price ({cur})</th>
            <th style={{ ...th, width: 120, textAlign: 'right' }}>Total price ({cur})</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={td}>{it.item_no || i + 1}</td>
              <td style={td}>{it.description}</td>
              {showOrigin && <td style={td}>{it.origin || ''}</td>}
              <td style={{ ...td, textAlign: 'right' }}>{Number(it.quantity).toLocaleString('en-US')} {it.unit && it.unit !== 'Each' ? it.unit : ''}</td>
              <td style={{ ...td, textAlign: 'right' }}>{it.unit_price != null ? Number(it.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</td>
              <td style={{ ...td, textAlign: 'right' }}>{it.unit_price != null ? lineTotal(it).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</td>
            </tr>
          ))}
          {(() => {
            const span = showOrigin ? 5 : 4;
            const row = (l: string, v: number, bold = false) => (
              <tr key={l}>
                <td colSpan={span} style={{ ...td, textAlign: 'right', fontWeight: bold ? 800 : 600 }}>{l}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: bold ? 800 : 600 }}>{v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            );
            return tot.separate
              ? [row('Sub-total', tot.subtotal), row(`VAT (${(Number(o.vat_rate ?? 0.165) * 100).toFixed(1)}%)`, tot.vat), row(`PPDA levy (${(Number(o.levy_rate ?? 0.01) * 100).toFixed(1)}%)`, tot.levy), row('GRAND TOTAL', tot.grand, true)]
              : [row(`TOTAL${o.prices_include ? ` (${o.prices_include})` : ''}`, tot.grand, true)];
          })()}
        </tbody>
      </table>
      <P style={{ marginTop: 10 }}>Total {quotation ? 'quoted' : 'bid'} price: <B>{moneyWithWords(tot.grand, cur)}</B></P>
      {quotation && (
        <Meta rows={[
          ['Validity:', `${o.validity_days || ctx.profile.validity_days || ''} days`],
          ['Delivery:', o.delivery || ctx.profile.delivery || ''],
          ['Payment terms:', o.payment_terms || ctx.profile.payment_terms || ''],
          ['Warranty:', o.warranty || ctx.profile.warranty || ''],
        ]} />
      )}
      {tot.separate && !quotation && <P style={{ fontSize: 11.5, color: '#4b5563' }}>Note: the Procurement Levy is calculated on the sub-total before taxes.</P>}
      <SignBlock ctx={ctx} />
    </Page>
  );
};

const BidSecuringDeclaration: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const t = ctx.data.tender || {};
  const o = ctx.data.options || {};
  return (
    <Page form="bid_securing_declaration">
      <Title>Bid Securing Declaration</Title>
      <Meta rows={[['Date:', fmtLongDate(o.bid_date)], ['Procurement Reference No.:', t.reference_number], ['Alternative No.:', o.alternative_no || 'N/A']]} />
      <To ctx={ctx} />
      <P>We, the undersigned, declare that—</P>
      <List type="1" items={[
        'We understand that, according to your conditions, Bids must be supported by a Bid Securing Declaration.',
        <>We accept that we will automatically be suspended from being eligible for Bidding in any contract with the Procuring and Disposing Entity and/or any other government entity for the period determined by the Government of Malawi if we are in breach of our obligation(s) under the Bid conditions, because we:
          <List items={[
            'have withdrawn our Bid during the period of Bid validity specified by us in the Bid Submission Sheet; or',
            'having been notified of the acceptance of our Bid by the Procuring and Disposing Entity during the period of Bid validity, (i) fail or refuse to execute the contract, if required, or (ii) fail or refuse to furnish the Performance Security, in accordance with the ITB; or',
            'do not accept the correction of our Bid by the Procuring and Disposing Entity, pursuant to the ITB.',
          ]} />
        </>,
        'We understand that this Bid Securing Declaration shall expire if we are not the successful Bidder, upon the earlier of (i) our receipt of a copy of your notification of the name of the successful Bidder; or (ii) thirty (30) days after the expiration of our Bid.',
        'We understand that if we are a Joint Venture, the Bid Securing Declaration must be in the name of the Joint Venture that submits the Bid.',
      ]} />
      <SignBlock ctx={ctx} />
    </Page>
  );
};

const BeneficialOwnership: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const t = ctx.data.tender || {};
  const o = ctx.data.options || {};
  const owners = (ctx.profile.beneficial_owners || []).filter((b) => b.name);
  const yn = (v: boolean) => (v ? 'Yes' : 'No');
  return (
    <Page form="beneficial_ownership">
      <Title>Beneficial Ownership Disclosure Form</Title>
      <Meta rows={[['Date:', fmtLongDate(o.bid_date)], ['Procurement Reference No.:', t.reference_number]]} />
      <To ctx={ctx} />
      <P>In response to your invitation for bids, we hereby provide the following beneficial ownership information.</P>
      <div style={{ fontWeight: 700, margin: '6px 0' }}>Details of beneficial ownership</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }} data-pdf-keep>
        <thead>
          <tr>
            <th style={th}>Identity of Beneficial Owner (full name, nationality, country of residence)</th>
            <th style={{ ...th, width: 110 }}>Directly or indirectly holding 5% or more of the shares</th>
            <th style={{ ...th, width: 110 }}>Directly or indirectly holding 5% or more of the voting rights</th>
            <th style={{ ...th, width: 130 }}>Directly or indirectly having the right to appoint a majority of the board</th>
          </tr>
        </thead>
        <tbody>
          {(owners.length ? owners : [{ name: '', nationality: '', residence: '', address: '', shares: false, votes: false, board: false }]).map((b, i) => (
            <tr key={i}>
              <td style={td}><B>{b.name}</B>{b.nationality ? `, ${b.nationality}` : ''}{b.residence ? `, resident in ${b.residence}` : ''}{b.address ? <div style={{ fontSize: 11.5, color: '#4b5563' }}>{b.address}</div> : null}</td>
              <td style={{ ...td, textAlign: 'center' }}>{b.name ? yn(b.shares) : ''}</td>
              <td style={{ ...td, textAlign: 'center' }}>{b.name ? yn(b.votes) : ''}</td>
              <td style={{ ...td, textAlign: 'center' }}>{b.name ? yn(b.board) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 14 }}>
        <div>Name of the Bidder: <B>{ctx.profile.legal_name}</B></div>
        <div>Name of the person duly authorised to sign the Bid on behalf of the Bidder: <B>{ctx.profile.signatory_name}</B></div>
        <div>Title of the person signing the Bid: <B>{ctx.profile.signatory_title}</B></div>
      </div>
      <SignBlock ctx={ctx} variant="declaration" />
    </Page>
  );
};

const AntiCorruption: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const p = ctx.profile;
  return (
    <Page form="anti_corruption">
      <Title>Anti-Corruption Declaration</Title>
      <P>We, <B>{p.legal_name}</B>{p.registration_number ? <>, bearing the company registration number <B>{p.registration_number}</B>,</> : ''} hereby:</P>
      <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>PLEDGE THAT:</div>
      <List type="1" items={[
        'We have read and understood, and will comply with all applicable laws and policies relating to anti-corruption and fraud.',
        'We shall not, through any of our representatives, agents or any persons associated with us, commit any corruption offence or breach any of the applicable laws and/or provisions. We shall not encourage any corruption elements within our business practices, activities, operations and transactions.',
        'We have not been convicted, nor are we aware that we are the subject of any corruption-related investigation, inquiry or enforcement proceedings by the relevant authorities, and we will report any such investigation as soon as we become aware of it, as far as reasonably practicable and to the extent permitted by law.',
        'We shall take all measures and implement appropriate measures to ensure compliance with the Anti-Corruption legal framework. We shall report to any relevant Authority a public officer attempting to solicit a bribe or advantage from us, or any other person connected to us, to be awarded a contract.',
      ]} />
      <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>AGREE THAT:</div>
      <P>In the event that we are in a confirmed breach of this declaration, the Procuring and Disposing Entity may disqualify the Bid, or revoke or terminate the contract if awarded to us, without any liability whatsoever on its part, and we shall indemnify the Procuring and Disposing Entity for any loss.</P>
      <SignBlock ctx={ctx} variant="declaration" />
    </Page>
  );
};

const Eshs: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const p = ctx.profile;
  return (
    <Page form="eshs_declaration">
      <Title>Environmental, Social, Health and Safety Declaration</Title>
      <P>We, <B>{p.legal_name}</B>{p.registration_number ? <>, bearing the company registration number <B>{p.registration_number}</B>,</> : ''} hereby:</P>
      <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>PLEDGE THAT:</div>
      <P>We have read, understood, and will comply with—</P>
      <List items={[
        'the Environment Management legal framework or policies in conservation and management of the environment;',
        'all necessary and appropriate measures to protect and manage the environment;',
        'all necessary and appropriate measures to conserve natural resources and to promote sustainable utilisation of natural resources; and',
        'all steps and measures necessary for ensuring that social safeguard issues, including but not limited to gender, human rights, disability, child protection, HIV and AIDS, are mainstreamed throughout all stages to minimise the negative impacts on the environment, social, health and safety matters.',
      ]} />
      <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>AGREE THAT:</div>
      <List type="1" items={[
        'In the event that our Bid is successful, we shall, within the period required by the Procuring and Disposing Entity, produce the environmental, social, health and safety plans required by the Bidding Documents.',
        'Contract negotiations shall only commence if our plans comply with the Malawi standards on the protection and management of environmental, social, health and safety matters.',
        'We will automatically be suspended from being eligible for Bidding in any contract with the Procuring and Disposing Entity and any other government entity for the period determined by the Authority if we are in breach of our obligation(s) under the Bid conditions.',
      ]} />
      <SignBlock ctx={ctx} variant="declaration" />
    </Page>
  );
};

const EligibleCountries: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => (
  <Page form="eligible_countries">
    <Title>Eligible Countries</Title>
    <Meta rows={[['Procurement Reference Number:', ctx.data.tender?.reference_number]]} />
    <P>We, <B>{ctx.profile.legal_name}</B>, have read and understood that all countries are eligible except countries subject to the following provisions. A country shall not be eligible if—</P>
    <List items={[
      'as a matter of law or official regulation, the Government of the Republic of Malawi prohibits commercial relations with that country; or',
      'by an act of compliance with a decision of the United Nations Security Council taken under Chapter VII of the Charter of the United Nations, the Government of the Republic of Malawi prohibits any import of goods from that country or any payments to persons or entities in that country.',
    ]} />
    <P>We confirm that we, and the goods and related services we offer, originate from eligible countries.</P>
    <SignBlock ctx={ctx} variant="declaration" />
  </Page>
);

const TechnicalCompliance: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const specs = ctx.data.specs || [];
  return (
    <Page form="technical_compliance">
      <Title sub={ctx.data.tender?.title}>Technical Specifications and Compliance Sheet</Title>
      <Meta rows={[['Procurement Reference Number:', ctx.data.tender?.reference_number], ['Bidder:', ctx.profile.legal_name]]} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 38 }}>Item</th>
            <th style={{ ...th, width: 90 }}>Feature</th>
            <th style={th}>Technical specification required</th>
            <th style={th}>Specification offered by {ctx.profile.legal_name}</th>
            <th style={{ ...th, width: 80 }}>Compliance</th>
          </tr>
        </thead>
        <tbody>
          {specs.map((s, i) => (
            <tr key={i} data-pdf-keep>
              <td style={td}>{s.item_no}</td>
              <td style={{ ...td, fontWeight: 600 }}>{s.section}</td>
              <td style={{ ...td, whiteSpace: 'pre-wrap' }}>{s.requirement}</td>
              <td style={{ ...td, whiteSpace: 'pre-wrap' }}>{s.offered}</td>
              <td style={{ ...td, fontWeight: 700, color: /does not/i.test(s.compliance) ? '#b91c1c' : /partly/i.test(s.compliance) ? '#b45309' : '#047857' }}>{String(s.compliance).toUpperCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SignBlock ctx={ctx} variant="declaration" />
    </Page>
  );
};

const ExperienceForm: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const rows = (ctx.profile.experience || []).filter((e) => e.client || e.description);
  return (
    <Page form="experience">
      <Title>Past Experience and References</Title>
      <Meta rows={[['Bidder:', ctx.profile.legal_name], ['Procurement Reference Number:', ctx.data.tender?.reference_number]]} />
      <P>The following are contracts of a similar nature completed by <B>{ctx.profile.legal_name}</B>. Copies of the purchase orders / contracts are available on request.</P>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 30 }}>#</th><th style={th}>Client / organisation</th><th style={th}>Goods / services supplied</th>
            <th style={{ ...th, width: 130, textAlign: 'right' }}>Contract value</th><th style={{ ...th, width: 54 }}>Year</th><th style={th}>Reference contact</th>
          </tr>
        </thead>
        <tbody>
          {(rows.length ? rows : [{ client: '', description: '', amount: '', year: '', contact: '' }]).map((e, i) => (
            <tr key={i} data-pdf-keep>
              <td style={td}>{rows.length ? i + 1 : ''}</td><td style={{ ...td, fontWeight: 600 }}>{e.client}</td><td style={td}>{e.description}</td>
              <td style={{ ...td, textAlign: 'right' }}>{e.amount}</td><td style={td}>{e.year}</td><td style={td}>{e.contact}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SignBlock ctx={ctx} variant="declaration" />
    </Page>
  );
};

const BankDetailsForm: React.FC<{ ctx: BidFormContext }> = ({ ctx }) => {
  const p = ctx.profile;
  const rows: [string, string | undefined][] = [
    ['Bank name', p.bank_name], ['Account name', p.bank_account_name], ['Account number', p.bank_account_number],
    ['Branch', p.bank_branch], ['Account type', p.bank_account_type], ['SWIFT code', p.swift_code],
  ];
  const filled = rows.filter(([, v]) => v);
  return (
    <Page form="bank_details">
      <Title>Bank Details</Title>
      <Meta rows={[['Bidder:', p.legal_name], ['Procurement Reference Number:', ctx.data.tender?.reference_number]]} />
      {filled.length ? (
        <table style={{ width: '70%', borderCollapse: 'collapse' }}>
          <tbody>{filled.map(([l, v]) => <tr key={l}><td style={{ ...th, width: 170 }}>{l}</td><td style={{ ...td, fontWeight: 600 }}>{v}</td></tr>)}</tbody>
        </table>
      ) : <P style={{ whiteSpace: 'pre-wrap' }}>{p.bank_details || ''}</P>}
      <SignBlock ctx={ctx} variant="declaration" />
    </Page>
  );
};

/** Render one form by key. */
export const BidFormView: React.FC<{ form: string; ctx: BidFormContext }> = ({ form, ctx }) => {
  switch (form) {
    case 'cover_letter': return <CoverLetter ctx={ctx} />;
    case 'bid_submission_sheet': return <BidSubmissionSheet ctx={ctx} />;
    case 'price_schedule': return <PriceSchedule ctx={ctx} />;
    case 'quotation': return <PriceSchedule ctx={ctx} quotation />;
    case 'bid_securing_declaration': return <BidSecuringDeclaration ctx={ctx} />;
    case 'beneficial_ownership': return <BeneficialOwnership ctx={ctx} />;
    case 'anti_corruption': return <AntiCorruption ctx={ctx} />;
    case 'eshs_declaration': return <Eshs ctx={ctx} />;
    case 'eligible_countries': return <EligibleCountries ctx={ctx} />;
    case 'technical_compliance': return <TechnicalCompliance ctx={ctx} />;
    case 'experience': return <ExperienceForm ctx={ctx} />;
    case 'bank_details': return <BankDetailsForm ctx={ctx} />;
    default: return null;
  }
};
