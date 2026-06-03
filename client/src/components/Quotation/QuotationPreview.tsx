import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Company, Quotation } from '../../types';
import QuotationDocument from './QuotationDocument';

interface QuotationPreviewProps {
  quotationData: Partial<Quotation>;
  company: Company;
}

// The document is rendered at this fixed width, then scaled down with a CSS
// transform so the whole A4 page is always fully visible within the available
// space (no internal scrolling).
const BASE_WIDTH = 800;
const A4_RATIO = 297 / 210;


const QuotationPreview: React.FC<QuotationPreviewProps> = ({ quotationData, company }) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(BASE_WIDTH * A4_RATIO);

  const recompute = useCallback(() => {
    const area = areaRef.current;
    const doc = docRef.current;
    if (!area || !doc) return;

    // Scale the document to fill the preview column's width — so a wider
    // column actually produces a bigger document, not just more whitespace.
    // If the result is taller than the viewport, the sticky pane scrolls
    // internally so the rest is still reachable.
    const availW = area.clientWidth;
    const natH = doc.scrollHeight || BASE_WIDTH * A4_RATIO;
    const next = Math.max(0.1, Math.min(availW / BASE_WIDTH, 1.4));

    setNaturalHeight(natH);
    setScale(next);
  }, []);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, quotationData, company]);

  useEffect(() => {
    const onChange = () => recompute();
    window.addEventListener('resize', onChange);

    let ro: ResizeObserver | undefined;
    if (docRef.current && 'ResizeObserver' in window) {
      ro = new ResizeObserver(onChange);
      ro.observe(docRef.current);
    }

    return () => {
      window.removeEventListener('resize', onChange);
      ro?.disconnect();
    };
  }, [recompute]);

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Live Preview</h3>
        <div ref={areaRef} className="flex justify-center">
          {/* Reserves the scaled footprint so the card sizes/centers correctly */}
          <div style={{ width: BASE_WIDTH * scale, height: naturalHeight * scale }}>
            <div
              ref={docRef}
              style={{ width: BASE_WIDTH, transformOrigin: 'top left', transform: `scale(${scale})` }}
            >
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
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationPreview;
