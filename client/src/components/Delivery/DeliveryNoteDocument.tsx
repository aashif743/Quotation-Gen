import React from 'react';
import { formatNumber } from '../../utils/calculations';

export interface DeliveryDocData {
  delivery_note_number?: string;
  client_name?: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  date?: string;
  items?: { description: string; quantity: number }[];
}

export interface DeliveryDocCompany {
  name: string;
  address?: string;
  tpin?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

interface DeliveryNoteDocumentProps {
  data: DeliveryDocData;
  company: DeliveryDocCompany;
  rootClassName?: string;
}

const A4_STYLE: React.CSSProperties = { aspectRatio: '210 / 297' };

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 17, g: 24, b: 39 };
};

const DeliveryNoteDocument: React.FC<DeliveryNoteDocumentProps> = ({
  data,
  company,
  rootClassName = '',
}) => {
  const primary = company.primary_color || '#111827';
  const secondary = company.secondary_color || '#ffffff';
  const rgb = hexToRgb(primary);
  const tint = (a: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;

  const dnNumber = data.delivery_note_number || 'DN-0000';
  const clientName = data.client_name || 'Client Name';
  const items = data.items || [];
  const hasItems = items.length > 0;
  const date = data.date ? new Date(data.date).toLocaleDateString() : 'N/A';

  return (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      {/* Header */}
      <div className="px-10 py-7 flex items-start justify-between" style={{ backgroundColor: tint(0.06) }}>
        <div className="flex flex-col">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={`${company.name} logo`}
              className="object-contain"
              style={{ maxHeight: 80, width: 'auto' }}
            />
          ) : (
            <div
              className="rounded-lg flex items-center justify-center font-bold"
              style={{ width: 70, height: 70, backgroundColor: primary, color: secondary, fontSize: 28 }}
            >
              {company.name.charAt(0)}
            </div>
          )}
          <div className="mt-3 max-w-sm">
            {company.address && <p className="text-sm text-gray-600">{company.address}</p>}
            {company.tpin && <p className="text-xs text-gray-500 mt-0.5">TPIN: {company.tpin}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-4xl font-extrabold tracking-tight" style={{ color: primary }}>
            DELIVERY NOTE
          </h2>
          <p className="text-lg font-semibold text-gray-900 mt-1">{dnNumber}</p>
          <p className="text-sm text-gray-500 mt-1">{date}</p>
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: primary }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        {/* Deliver To */}
        <div className="rounded-lg border p-4 mb-8" style={{ borderColor: tint(0.25) }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>
            Deliver To
          </p>
          <p className="font-semibold text-gray-900">{clientName}</p>
          {data.client_address && <p className="text-sm text-gray-600 mt-1">{data.client_address}</p>}
          {data.client_email && <p className="text-sm text-gray-600">{data.client_email}</p>}
          {data.client_phone && <p className="text-sm text-gray-600">{data.client_phone}</p>}
        </div>

        {/* Items table */}
        <table className="w-full">
          <thead>
            <tr className="text-left" style={{ backgroundColor: primary, color: secondary }}>
              <th className="px-4 py-3 font-semibold text-sm w-12 text-center">#</th>
              <th className="px-4 py-3 font-semibold text-sm">Description</th>
              <th className="px-4 py-3 font-semibold text-sm text-center w-32">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {hasItems ? (
              items.map((item, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 ? tint(0.04) : 'transparent' }}>
                  <td className="px-4 py-3 text-sm text-center border-b border-gray-100 text-gray-500">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3 text-sm border-b border-gray-100 whitespace-pre-wrap">
                    {item.description}
                  </td>
                  <td className="px-4 py-3 text-sm text-center border-b border-gray-100 font-medium tabular-nums">
                    {formatNumber(item.quantity)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No items added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Signature block — always pinned to bottom of the page */}
        <div className="mt-auto pt-12">
          <div className="grid grid-cols-2 gap-12">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: primary }}>
                Delivered By
              </p>
              <div className="border-t border-gray-400 pt-2 text-xs uppercase tracking-widest text-gray-500">
                Name &amp; Signature
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: primary }}>
                Received By
              </p>
              <div className="border-t border-gray-400 pt-2 text-xs uppercase tracking-widest text-gray-500">
                Signature / Stamp
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryNoteDocument;
