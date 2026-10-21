import React, { useRef, useState } from 'react';
import { Paperclip, Upload, FileText, Image as ImageIcon, X, RefreshCw, Trash2, Loader2 } from 'lucide-react';

// Shared UI for payment proof documents (bank slips, receipts, transfer
// screenshots): a picker used inside the record-payment dialogs, and a compact
// cell used in payment lists to view / upload / replace / remove the proof.

export const PROOF_ACCEPT = 'image/*,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

/** Client-side check mirroring the server rules. Returns an error or ''. */
export const validateProofFile = (file: File): string => {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
  if (!isPdf && !isImage) return 'Only image or PDF files are allowed.';
  if (file.size > MAX_BYTES) return 'File is too large (max 10 MB).';
  return '';
};

const isPdfUrl = (url: string) => /\.pdf($|\?)/i.test(url);

/** Optional proof attachment inside a "record payment" dialog. */
export const ProofFilePicker: React.FC<{
  file: File | null;
  onChange: (file: File | null) => void;
  onError?: (message: string) => void;
}> = ({ file, onChange, onError }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-900 mb-1">
        Payment proof <span className="font-normal text-gray-400">(optional — bank slip, receipt, screenshot)</span>
      </label>
      <input
        ref={inputRef}
        type="file"
        accept={PROOF_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          e.target.value = '';
          if (!f) return;
          const err = validateProofFile(f);
          if (err) { onError?.(err); return; }
          onChange(f);
        }}
      />
      {file ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm">
          <span className="flex items-center gap-2 min-w-0 text-emerald-800">
            <Paperclip className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{file.name}</span>
          </span>
          <button type="button" onClick={() => onChange(null)} className="p-1 rounded text-emerald-700 hover:bg-emerald-100" aria-label="Remove attachment">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
        >
          <Upload className="h-4 w-4" /> Attach photo or PDF (max 10 MB)
        </button>
      )}
    </div>
  );
};

/**
 * Proof cell for a payment row.
 *  - Proof attached → "View" link (opens in a new tab). Admins also get
 *    Replace / Remove.
 *  - No proof → "Upload" for users allowed to act on the payment.
 */
export const PaymentProofCell: React.FC<{
  url?: string | null;
  fileName?: string | null;
  uploadedBy?: string | null;
  canUpload: boolean;
  isAdmin: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}> = ({ url, fileName, uploadedBy, canUpload, isAdmin, onUpload, onRemove }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();
  const handleFile = async (file: File) => {
    const err = validateProofFile(file);
    if (err) { alert(err); return; }
    setBusy(true);
    try {
      await onUpload(file);
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Could not upload the proof. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const handleRemove = async () => {
    if (!window.confirm('Remove this payment proof? The file will be deleted.')) return;
    setBusy(true);
    try {
      await onRemove();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Could not remove the proof.');
    } finally {
      setBusy(false);
    }
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={PROOF_ACCEPT}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) handleFile(f);
      }}
    />
  );

  if (busy) {
    return <span className="inline-flex items-center text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Working…</span>;
  }

  if (url) {
    const Icon = isPdfUrl(url) ? FileText : ImageIcon;
    return (
      <span className="inline-flex items-center gap-1">
        {input}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${fileName || 'Payment proof'}${uploadedBy ? ` — uploaded by ${uploadedBy}` : ''}`}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
        >
          <Icon className="h-3.5 w-3.5" /> View
        </a>
        {isAdmin && (
          <>
            <button onClick={pick} className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50" title="Replace proof">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button onClick={handleRemove} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="Remove proof">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </span>
    );
  }

  if (!canUpload) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span>
      {input}
      <button
        onClick={pick}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-600 border border-dashed border-gray-300 hover:border-emerald-400 hover:text-emerald-700"
        title="Upload proof of payment (photo or PDF)"
      >
        <Upload className="h-3.5 w-3.5" /> Upload
      </button>
    </span>
  );
};
