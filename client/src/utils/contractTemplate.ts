import { Contract, ContractSection } from '../types';

// Format a currency amount using the contract/company currency. Falls back to a
// plain number if the code is unknown.
export const formatContractMoney = (amount?: number | null, currency?: string | null): string => {
  const value = Number(amount || 0);
  const code = (currency || 'MWK').toUpperCase();
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

// Human-friendly long date, e.g. "September 3, 2026". Accepts YYYY-MM-DD.
export const formatLongDate = (s?: string | null): string => {
  if (!s) return '';
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
};

const freqLabel = (f?: string | null): string => {
  switch ((f || '').toLowerCase()) {
    case 'monthly': return 'monthly';
    case 'quarterly': return 'quarterly';
    case 'annually': return 'annual';
    case 'one-time': return 'one-time';
    default: return f || 'periodic';
  }
};

type Input = Partial<Contract> & { company_name?: string };

// Build a professional, ready-to-edit set of clauses from the key inputs. The
// user can then tweak any wording before saving.
export function buildDefaultSections(i: Input): ContractSection[] {
  const company = i.company_name || 'the Company';
  const client = i.client_name || 'the Client';
  const site = i.site && String(i.site).trim() ? String(i.site).trim() : '[Insert site / location]';
  const freq = freqLabel(i.payment_frequency);
  const pay = i.payment_amount ? formatContractMoney(i.payment_amount, i.currency) : '[Insert amount]';
  const total = i.amount ? formatContractMoney(i.amount, i.currency) : '';
  const start = i.start_date ? formatLongDate(i.start_date) : '[Start Date]';
  const end = i.end_date ? formatLongDate(i.end_date) : '[End Date]';
  const period = i.contract_period && String(i.contract_period).trim() ? String(i.contract_period).trim() : '';

  const sections: ContractSection[] = [];

  sections.push({
    heading: 'Services & Location',
    body:
      `${company} agrees to provide the services described in this Agreement to ${client} at the following ` +
      `site/location: ${site}.` +
      (total ? ` The total contract value is ${total}.` : '') +
      ` Any additions or changes to the scope shall be agreed in writing by both parties.`,
  });

  sections.push({
    heading: 'Term & Payment Terms',
    body:
      `This Agreement shall commence on ${start} and continue until ${end}` +
      (period ? ` (${period})` : '') +
      `, unless terminated earlier in accordance with this Agreement.\n\n` +
      `${client} agrees to pay ${company} the sum of ${pay} on a ${freq} basis. ` +
      `Payments are due in advance on the 1st day of each ${freq === 'quarterly' ? 'quarter' : freq === 'annual' ? 'year' : 'month'}, ` +
      `unless otherwise agreed in writing.`,
  });

  sections.push({
    heading: 'Early Termination',
    body:
      (i.termination_rules && String(i.termination_rules).trim())
        ? String(i.termination_rules).trim()
        : `Either party may terminate this Agreement by giving thirty (30) days written notice. If ${client} ` +
          `terminates early, any fees due up to the termination date remain payable, and an early-termination ` +
          `fee may apply as agreed by the parties.`,
  });

  sections.push({
    heading: 'Responsibilities & Maintenance',
    body:
      `${company} shall perform the services with reasonable skill and care and keep any equipment or ` +
      `installations in good working condition. ${client} shall provide the access, materials, and information ` +
      `reasonably required for ${company} to perform its obligations. ${company} shall not be liable for delays ` +
      `or damage caused by events beyond its reasonable control.`,
  });

  if (i.comments && String(i.comments).trim()) {
    sections.push({ heading: 'Additional Terms', body: String(i.comments).trim() });
  }

  sections.push({
    heading: 'General',
    body:
      `This Agreement constitutes the entire agreement between the parties and supersedes any prior ` +
      `understandings. Any amendment must be made in writing and signed by both parties. This Agreement shall be ` +
      `governed by the laws of the jurisdiction in which ${company} operates.`,
  });

  return sections;
}
