import { Bid, BidDocument, BidProfile, DOC_TYPE_LABELS, FORM_LABELS, bidTotals, formForLabel } from '../services/bidsApi';

export type CheckLevel = 'error' | 'warning' | 'ok';
export interface CheckResult { level: CheckLevel; text: string; tab: string }

/**
 * Everything that commonly gets a bid rejected or embarrasses the bidder,
 * checked before the bid pack is downloaded. Amounts, words, reference
 * numbers and names cannot disagree between forms (they come from one place),
 * so the checks focus on what is missing, expired, short or inconsistent.
 */
export function checkBid(bid: Bid, profile: BidProfile, docs: BidDocument[], signatureUrl: string | null): CheckResult[] {
  const out: CheckResult[] = [];
  const d = bid.data || {};
  const t = d.tender || {};
  const o = d.options || {};
  const forms = d.forms || [];
  const add = (level: CheckLevel, text: string, tab: string) => out.push({ level, text, tab });
  const docById = new Map(docs.map((x) => [x.id, x]));
  const deadline = t.deadline ? new Date(t.deadline.replace(' ', 'T')) : null;
  const daysBeforeDeadline = (expires: string) => (deadline ? Math.floor((new Date(`${expires}T00:00:00`).getTime() - deadline.getTime()) / 86400000) : null);

  // Tender details
  if (!t.title) add('error', 'The subject of the procurement is missing.', 'overview');
  if (!(t.addressee || t.procuring_entity)) add('error', 'Who the bid is addressed to (procuring entity and address) is missing.', 'overview');
  if (bid.kind === 'tender' && !t.reference_number) add('error', 'The procurement reference number is missing — it appears on every form.', 'overview');
  if (!t.deadline) add('warning', 'The submission deadline is not set, so you will not be warned in time.', 'overview');
  else if (deadline && deadline.getTime() < Date.now()) add('warning', 'The submission deadline has passed.', 'overview');
  if (!o.bid_date) add('error', 'The bid date is missing.', 'forms');

  // Profile
  if (!profile.legal_name) add('error', 'The company name is missing in the Bid Profile.', 'profile');
  if (!profile.signatory_name || !profile.signatory_title) add('error', 'The authorised signatory (name and position) is missing in the Bid Profile.', 'profile');
  if (bid.kind === 'tender' && !profile.registration_number) add('warning', 'The business registration number is missing in the Bid Profile (used in the declarations).', 'profile');
  if (forms.includes('bid_submission_sheet') && !(profile.directors || []).some((x) => x.name)) add('error', 'No directors in the Bid Profile — the Bid Submission Sheet asks for them.', 'profile');
  if (forms.includes('beneficial_ownership') && !(profile.beneficial_owners || []).some((x) => x.name)) add('error', 'No beneficial owners in the Bid Profile — needed for the Beneficial Ownership form.', 'profile');
  if (o.show_signature !== false && !signatureUrl) add('warning', 'There is no saved signature for the signatory — the forms will need to be signed by hand.', 'forms');

  // Prices
  const items = d.items || [];
  if (!items.length) add('error', 'There are no items in the price schedule.', 'prices');
  const unpriced = items.filter((it) => it.unit_price == null || !(Number(it.unit_price) > 0));
  if (unpriced.length) add('error', `${unpriced.length} item${unpriced.length === 1 ? ' has' : 's have'} no unit price.`, 'prices');
  if (items.some((it) => !(Number(it.quantity) > 0))) add('error', 'An item has no quantity.', 'prices');
  if (bid.kind === 'tender' && forms.includes('price_schedule') && items.some((it) => !it.origin)) add('warning', 'The country of origin is missing for some items.', 'prices');
  if (items.length && !unpriced.length) add('ok', `Total ${bidTotals(d).grand.toLocaleString('en-US', { minimumFractionDigits: 2 })} — the same figure and words are used on every form.`, 'prices');

  // Validity
  const need = Number(t.validity_days) || 0;
  const offered = Number(o.validity_days) || 0;
  if (need && offered < need) add('error', `Bid validity is ${offered || 0} days but the tender requires ${need} days — the bid would be rejected.`, 'forms');
  else if (need && offered >= need) add('ok', `Bid validity ${offered} days meets the required ${need} days.`, 'forms');

  // Technical compliance
  const specs = d.specs || [];
  if (forms.includes('technical_compliance')) {
    if (!specs.length) add('warning', 'The technical compliance sheet has no specifications.', 'technical');
    const failsMandatory = specs.filter((s) => s.mandatory && /does not/i.test(s.compliance));
    if (failsMandatory.length) add('error', `${failsMandatory.length} mandatory specification${failsMandatory.length === 1 ? ' is' : 's are'} marked “Does not comply” — the bid may be rejected.`, 'technical');
    const empty = specs.filter((s) => !String(s.offered || '').trim());
    if (empty.length) add('error', `${empty.length} specification${empty.length === 1 ? ' has' : 's have'} no “offered” answer — a blank column C can lead to rejection.`, 'technical');
  }

  // Checklist and documents
  for (const c of d.checklist || []) {
    if (c.doc_type === 'condition' || c.doc_type === 'form') {
      const form = formForLabel(c.label);
      if (form && !c.done) {
        if (!forms.includes(form)) add(c.mandatory ? 'error' : 'warning', `Required form not in the bid pack: ${FORM_LABELS[form]}`, 'forms');
        continue; // included → filled in automatically
      }
      // "Bid validity 120 days" is met when the offered validity is long enough.
      if (/validity/i.test(c.label) && need && offered >= need) continue;
      if (c.mandatory && !c.done) add('warning', `Not ticked yet: ${c.label}`, 'checklist');
      continue;
    }
    const doc = c.document_id ? docById.get(c.document_id) : undefined;
    if (!doc) {
      if (c.mandatory && !c.done) add('error', `Missing document: ${c.label}`, 'checklist');
      continue;
    }
    if (doc.expires) {
      const left = Number(doc.days_left);
      const beforeDl = daysBeforeDeadline(doc.expires);
      if (left < 0) add('error', `${doc.title} has expired (${doc.expires}).`, 'checklist');
      else if (beforeDl != null && beforeDl < 0) add('error', `${doc.title} expires before the submission deadline.`, 'checklist');
      else if (left <= 30) add('warning', `${doc.title} expires in ${left} days.`, 'checklist');
    }
  }
  for (const id of o.attachments || []) {
    const doc = docById.get(id);
    if (!doc) add('warning', 'An attached document was removed from the vault.', 'checklist');
  }

  // Leftover blanks
  const blanks = [o.cover_body, o.cover_subject, o.warranty, o.delivery, o.payment_terms].join(' ').match(/\[[^\]\n]{1,60}\]/g);
  if (blanks && blanks.length) add('error', `Blanks still to fill in: ${Array.from(new Set(blanks)).slice(0, 5).join(', ')}`, 'forms');

  if (bid.kind === 'tender' && !forms.includes('bid_submission_sheet')) add('warning', 'The Bid Submission Sheet is not included — most tenders require it.', 'forms');
  if (!forms.length) add('error', 'No forms are selected for the bid pack.', 'forms');
  return out;
}

export const docTypeLabel = (t: string) => DOC_TYPE_LABELS[t] || t;
