import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// The document is rendered at this fixed width, then scaled with a CSS
// transform to fill the preview column, so the whole A4 page is visible.
const BASE_WIDTH = 800;
const A4_RATIO = 297 / 210;

interface Props {
  /** The document to show (QuotationDocument, InvoiceDocument, …). */
  children: React.ReactNode;
  /** Values that change the document, so the size is re-measured. */
  watch?: unknown[];
  title?: string;
}

/** "Live Preview" card used beside every document form. */
const DocumentPreview: React.FC<Props> = ({ children, watch, title = 'Live Preview' }) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(BASE_WIDTH * A4_RATIO);

  const recompute = useCallback(() => {
    const area = areaRef.current;
    const doc = docRef.current;
    if (!area || !doc) return;
    const h = doc.scrollHeight || BASE_WIDTH * A4_RATIO;
    const sc = Math.max(0.1, Math.min(area.clientWidth / BASE_WIDTH, 1.4));
    // Only update when something really changed, so measuring never loops.
    setNaturalHeight((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
    setScale((prev) => (Math.abs(prev - sc) < 0.0005 ? prev : sc));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { recompute(); }, [recompute, ...(watch || [])]);

  useEffect(() => {
    window.addEventListener('resize', recompute);
    let ro: ResizeObserver | undefined;
    if (docRef.current && 'ResizeObserver' in window) {
      ro = new ResizeObserver(recompute);
      ro.observe(docRef.current);
      if (areaRef.current) ro.observe(areaRef.current);
    }
    return () => {
      window.removeEventListener('resize', recompute);
      ro?.disconnect();
    };
  }, [recompute]);

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
        <div ref={areaRef} className="flex justify-center">
          {/* Reserves the scaled footprint so the card sizes/centers correctly */}
          <div style={{ width: BASE_WIDTH * scale, height: naturalHeight * scale }}>
            <div ref={docRef} style={{ width: BASE_WIDTH, transformOrigin: 'top left', transform: `scale(${scale})` }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentPreview;

/**
 * Sticky right-hand column holding the preview on wide screens (same layout as
 * New Quotation).
 */
export const PreviewColumn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh_-_3rem)] xl:overflow-y-auto">{children}</div>
);

const PREVIEW_KEY = 'qf.showPreview';

/** Show / hide the live preview; the choice is remembered across forms. */
export const usePreviewToggle = (): [boolean, () => void] => {
  const [show, setShow] = React.useState<boolean>(() => {
    try { return localStorage.getItem(PREVIEW_KEY) !== '0'; } catch { return true; }
  });
  const toggle = () => setShow((v) => {
    try { localStorage.setItem(PREVIEW_KEY, v ? '0' : '1'); } catch { /* private mode */ }
    return !v;
  });
  return [show, toggle];
};

export const PreviewToggleButton: React.FC<{ show: boolean; onToggle: () => void }> = ({ show, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
  >
    {show ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
    {show ? 'Hide Preview' : 'Show Preview'}
  </button>
);
