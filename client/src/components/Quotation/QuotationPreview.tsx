import React from 'react';
import { Company, Quotation } from '../../types';
import QuotationDocument from './QuotationDocument';
import DocumentPreview from '../Document/DocumentPreview';

interface QuotationPreviewProps {
  quotationData: Partial<Quotation>;
  company: Company;
}

const QuotationPreview: React.FC<QuotationPreviewProps> = ({ quotationData, company }) => (
  <DocumentPreview watch={[quotationData, company]}>
    <QuotationDocument
      template={company.template}
      data={quotationData}
      company={{
        name: company.name,
        address: company.address,
        tpin: company.tpin,
        bank_details: company.bank_details,
        // Quotation header always uses the bundled brand logo, not the
        // admin-uploaded thumbnail.
        logo_url: company.quote_logo_url || company.logo_url,
        primary_color: company.primary_color,
        secondary_color: company.secondary_color,
        vat_rate: company.vat_rate,
        ppda_rate: company.ppda_rate,
        letterhead: company.letterhead,
        currency: company.currency,
      }}
    />
  </DocumentPreview>
);

export default QuotationPreview;
