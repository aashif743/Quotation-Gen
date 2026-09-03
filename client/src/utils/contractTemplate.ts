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

// The default title new contracts start with.
export const DEFAULT_CONTRACT_TITLE = 'Billboard Advertising Contract';

// Build the DEFAULT contract clauses (billboard advertising wording) from the
// key inputs. This is what every NEW contract starts with; editing or
// regenerating only changes that one contract, never this template.
export function buildDefaultSections(i: Input): ContractSection[] {
  const company = i.company_name || 'the Company';
  const client = i.client_name && String(i.client_name).trim() ? String(i.client_name).trim() : 'the Advertiser';
  const site = i.site && String(i.site).trim() ? String(i.site).trim() : '[Insert billboard location / street address / intersection]';
  const freq = freqLabel(i.payment_frequency);           // e.g. "monthly"
  const dueUnit = freq === 'quarterly' ? 'quarter' : freq === 'annual' ? 'year' : 'month';
  const pay = i.payment_amount ? formatContractMoney(i.payment_amount, i.currency) : '[Insert amount]';
  const total = i.amount ? formatContractMoney(i.amount, i.currency) : '';
  const start = i.start_date ? formatLongDate(i.start_date) : '[Start Date]';
  const end = i.end_date ? formatLongDate(i.end_date) : '[End Date]';
  const period = i.contract_period && String(i.contract_period).trim() ? String(i.contract_period).trim() : '';

  const sections: ContractSection[] = [];

  sections.push({
    heading: 'Advertising Services & Location',
    body:
      `${company} (the "Company") agrees to provide billboard advertising services to ${client} (the "Advertiser") ` +
      `at the following location(s): ${site}. The billboard location, quantity, and placement details are as set out ` +
      `in the schedule of details above.` +
      (total ? ` The total contract value is ${total}.` : '') +
      ` The Advertiser shall supply high-resolution artwork conforming to the Company's specifications.`,
  });

  sections.push({
    heading: 'Term & Payment Terms',
    body:
      `Contract Term: This Agreement shall commence on ${start} and continue ` +
      (i.end_date ? `until ${end}` : `on a ${dueUnit}-to-${dueUnit} basis`) +
      (period ? ` (${period})` : '') +
      `, unless terminated earlier in accordance with this Agreement.\n\n` +
      `Invoicing: The Advertiser agrees to pay the Company ${pay} on a ${freq} basis. Payments are due in advance ` +
      `on the 1st day of each calendar ${dueUnit}, unless otherwise agreed in writing.`,
  });

  sections.push({
    heading: 'Early Termination & Removal Fees',
    body:
      `The Advertiser may request the early removal of billboard advertising materials prior to the scheduled ` +
      `contract end date subject to the following condition:\n\n` +
      (i.termination_rules && String(i.termination_rules).trim()
        ? String(i.termination_rules).trim()
        : `Early Removal / Deduction Fee: If the Advertiser terminates this Agreement or requests removal of the ` +
          `billboard(s) early, the Advertiser shall pay a deduction/removal fee as agreed by the parties ` +
          `(for example, a fixed fee or a percentage of the remaining contract value).`),
  });

  sections.push({
    heading: 'Maintenance and Production',
    body:
      `The Company shall ensure the billboard structure is maintained in good condition. The Advertiser is ` +
      `responsible for providing high-resolution artwork conforming to the Company's specifications. The Company is ` +
      `not liable for structural damage caused by severe weather or vandalism but will make reasonable efforts to ` +
      `repair displays promptly.`,
  });

  if (i.comments && String(i.comments).trim()) {
    sections.push({ heading: 'Additional Terms', body: String(i.comments).trim() });
  }

  return sections;
}
