// Ready-made letters. Words in [square brackets] are for the user to replace;
// the form warns about any left before saving. {company} becomes the
// company name.

export interface LetterTemplate {
  id: string;
  name: string;
  category: 'Clients' | 'Payments' | 'Staff' | 'General';
  subject: string;
  salutation: string;
  body: string;
  closing: string;
}

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    id: 'quotation-cover',
    name: 'Quotation cover letter',
    category: 'Clients',
    subject: 'Quotation for [goods / services]',
    salutation: 'Dear Sir/Madam,',
    body:
      'Thank you for your enquiry regarding [goods / services]. We are pleased to submit our quotation [quotation number] for your consideration.\n\n' +
      'The quotation covers [short description of what is included]. Our prices are valid for [30] days from the date of this letter, and delivery can be made within [number] days of receiving your order.\n\n' +
      'Should you require any clarification or wish to discuss the details, please do not hesitate to contact us. We look forward to working with you.',
    closing: 'Yours faithfully,',
  },
  {
    id: 'order-confirmation',
    name: 'Order confirmation',
    category: 'Clients',
    subject: 'Confirmation of Order [order / LPO number]',
    salutation: 'Dear [Name],',
    body:
      'We acknowledge with thanks receipt of your order [order / LPO number] dated [date] for [goods / services].\n\n' +
      'We confirm that the order is being processed and will be delivered to [delivery address] on or before [delivery date]. The total value of the order is MK [amount].\n\n' +
      'Thank you for choosing {company}. We value your business.',
    closing: 'Yours sincerely,',
  },
  {
    id: 'company-introduction',
    name: 'Company introduction',
    category: 'Clients',
    subject: 'Introduction of {company}',
    salutation: 'Dear Sir/Madam,',
    body:
      'We are pleased to introduce {company}, a [type of business] based in [town]. We specialise in [main products / services].\n\n' +
      'Our services include:\n- [Service one]\n- [Service two]\n- [Service three]\n\n' +
      'We would welcome the opportunity to serve your organisation and would be glad to arrange a meeting or provide a quotation at your convenience.',
    closing: 'Yours faithfully,',
  },
  {
    id: 'thank-you',
    name: 'Thank you for your business',
    category: 'Clients',
    subject: 'Thank You for Your Business',
    salutation: 'Dear [Name],',
    body:
      'On behalf of everyone at {company}, thank you for choosing us for [project / order]. It was a pleasure working with you.\n\n' +
      'We hope the [goods / services] met your expectations. Please let us know if there is anything more we can do for you.\n\n' +
      'We look forward to serving you again.',
    closing: 'Yours sincerely,',
  },
  {
    id: 'complaint-response',
    name: 'Reply to a complaint',
    category: 'Clients',
    subject: 'Your Complaint Regarding [subject]',
    salutation: 'Dear [Name],',
    body:
      'Thank you for bringing to our attention the issue regarding [subject] on [date]. We sincerely apologise for the inconvenience this has caused.\n\n' +
      'We have looked into the matter and [what happened / what was found]. To put this right, we will [corrective action] by [date].\n\n' +
      'We value your business and have taken steps to make sure this does not happen again.',
    closing: 'Yours sincerely,',
  },
  {
    id: 'payment-reminder',
    name: 'Payment reminder',
    category: 'Payments',
    subject: 'Outstanding Payment for Invoice [invoice number]',
    salutation: 'Dear [Name],',
    body:
      'Our records show that invoice [invoice number] dated [invoice date] for MK [amount] remains unpaid. The payment was due on [due date].\n\n' +
      'We kindly request you to settle the outstanding balance at your earliest convenience. If payment has already been made, please send us the proof of payment so that we can update our records.\n\n' +
      'Thank you for your prompt attention to this matter.',
    closing: 'Yours sincerely,',
  },
  {
    id: 'final-demand',
    name: 'Final payment demand',
    category: 'Payments',
    subject: 'Final Demand: Invoice [invoice number]',
    salutation: 'Dear [Name],',
    body:
      'Despite our previous reminders dated [dates], invoice [invoice number] for MK [amount] remains unpaid.\n\n' +
      'We request full payment within [7] days of the date of this letter. If payment is not received by [date], we will have no option but to [next step], without further notice.\n\n' +
      'If you have already paid, or wish to discuss a payment plan, please contact us immediately.',
    closing: 'Yours faithfully,',
  },
  {
    id: 'payment-confirmation',
    name: 'Payment confirmation',
    category: 'Payments',
    subject: 'Confirmation of Payment Received',
    salutation: 'Dear [Name],',
    body:
      'We confirm receipt of your payment of MK [amount] on [date] in settlement of invoice [invoice number].\n\n' +
      'Your account is now [fully settled / left with a balance of MK amount]. Thank you for your payment.',
    closing: 'Yours sincerely,',
  },
  {
    id: 'appointment',
    name: 'Offer of employment',
    category: 'Staff',
    subject: 'Offer of Employment: [Position]',
    salutation: 'Dear [Name],',
    body:
      'Following your recent interview, we are pleased to offer you the position of [position] at {company}, starting on [start date].\n\n' +
      'Your gross salary will be MK [amount] per month. You will report to [supervisor] and your normal working hours are [hours]. The first [3] months will be a probation period.\n\n' +
      'Please confirm your acceptance by signing and returning a copy of this letter by [date]. We look forward to welcoming you to the team.',
    closing: 'Yours sincerely,',
  },
  {
    id: 'reference',
    name: 'Reference / recommendation',
    category: 'Staff',
    subject: 'Reference for [Name]',
    salutation: 'To Whom It May Concern,',
    body:
      'This is to confirm that [Name] has been employed by {company} as [position] from [start date] to [end date / date].\n\n' +
      'During this time, [he / she] has shown [qualities, e.g. reliability, honesty and good work ethic]. [His / Her] responsibilities included [main duties].\n\n' +
      'We have no hesitation in recommending [Name] for any position that suits [his / her] skills. Please contact us should you need further information.',
    closing: 'Yours faithfully,',
  },
  {
    id: 'leave-approval',
    name: 'Leave approval',
    category: 'Staff',
    subject: 'Approval of Leave',
    salutation: 'Dear [Name],',
    body:
      'Your application for [annual / sick / maternity] leave from [start date] to [end date] has been approved.\n\n' +
      'You are expected to resume duty on [return date]. Please make sure your work is handed over to [colleague] before you go.',
    closing: 'Yours sincerely,',
  },
  {
    id: 'to-whom',
    name: 'To whom it may concern',
    category: 'General',
    subject: '[Subject]',
    salutation: 'To Whom It May Concern,',
    body: 'This letter serves to confirm that [statement].\n\nShould you require any further information, please contact the undersigned.',
    closing: 'Yours faithfully,',
  },
  {
    id: 'blank',
    name: 'Blank letter',
    category: 'General',
    subject: '',
    salutation: 'Dear Sir/Madam,',
    body: '',
    closing: 'Yours faithfully,',
  },
];

/** Placeholders ("[...]") still in a text. */
export const placeholdersIn = (...texts: (string | null | undefined)[]): string[] => {
  const found = new Set<string>();
  texts.forEach((t) => (String(t || '').match(/\[[^\]\n]{1,60}\]/g) || []).forEach((m) => found.add(m)));
  return Array.from(found);
};
