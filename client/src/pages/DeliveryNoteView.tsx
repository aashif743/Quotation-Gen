import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getDeliveryNote,
  uploadSignedDeliveryNote,
  deleteSignedDeliveryNote,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DeliveryNote } from '../types';
import { generateDeliveryNotePDF } from '../utils/pdfGenerator';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { brandColorFor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';
import DeliveryNoteDocument from '../components/Delivery/DeliveryNoteDocument';
import {
  Download,
  ArrowLeft,
  Printer,
  Upload,
  CheckCircle2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Loader2,
  Edit2,
} from 'lucide-react';

const DeliveryNoteView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [dn, setDn] = useState<DeliveryNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Signed-copy state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0); // counts dragenter/leave across child elements

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const data = await getDeliveryNote(parseInt(id));
        setDn(data);
      } catch (error) {
        console.error('Error loading delivery note:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Browser tab + any leaked print header gets a meaningful title.
  useDocumentTitle(
    dn
      ? `Delivery Note ${dn.delivery_note_number}${dn.client_name ? ` — ${dn.client_name}` : ''}`
      : null
  );

  // Prevent the browser from opening the file when the user misses the drop
  // zone — without these handlers it would navigate away from the page.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  const handleDownloadPDF = async () => {
    if (!dn) return;
    setGenerating(true);
    try {
      await generateDeliveryNotePDF(dn);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => window.print();

  const handlePickFile = () => fileInputRef.current?.click();

  // Single upload pipeline used by the file picker and the drop zone.
  // Validates type and size client-side so the user gets immediate feedback
  // instead of waiting for the server to reject the request.
  const uploadFile = async (file: File) => {
    if (!dn?.id) return;
    const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!isAllowed) {
      setUploadError('Only image or PDF files are allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large (10 MB maximum).');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const updated = await uploadSignedDeliveryNote(dn.id, file);
      setDn((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err: any) {
      setUploadError(err?.response?.data?.error || 'Failed to upload signed copy.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    await uploadFile(file);
  };

  // Drag handlers. We count dragenter/dragleave because moving the pointer
  // over a child element fires `dragleave` on the parent — without the counter
  // the highlight flickers off and on.
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types?.includes('Files')) {
      dragCounter.current += 1;
      setDragOver(true);
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // required for `onDrop` to fire
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  };

  const handleRemoveSigned = async () => {
    if (!dn?.id) return;
    if (!window.confirm('Remove the signed copy? You can upload a new one anytime.')) return;
    try {
      await deleteSignedDeliveryNote(dn.id);
      setDn((prev) =>
        prev ? { ...prev, signed_file_url: null, signed_at: null, signed_by: null, signed_by_name: null } : prev
      );
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to remove signed copy.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300" />
      </div>
    );
  }

  if (!dn) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Delivery note not found</p>
        <button onClick={() => navigate('/delivery-history')} className="text-blue-600 hover:underline">
          Back to Delivery History
        </button>
      </div>
    );
  }

  // Use the brightened brand color for chrome buttons in dark mode so very
  // dark brand palettes still pop. The document itself keeps the raw value.
  const { theme } = useTheme();
  const rawPrimary = dn.primary_color || '#111827';
  const primary = brandColorFor(rawPrimary, theme === 'dark');
  const hasSigned = !!dn.signed_file_url;
  const isPdf = (dn.signed_file_url || '').toLowerCase().endsWith('.pdf');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action bar — uniform compact buttons, same height/padding/icon size. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Admin can edit anything; staff can edit their own delivery notes. */}
          {(isAdmin || (user && dn.created_by === user.id)) && (
            <button
              onClick={() => navigate(`/edit-delivery-note/${id}`)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <Edit2 className="h-4 w-4 mr-1.5" />
              Edit
            </button>
          )}
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={generating}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white rounded-lg shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1.5" />
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1.5" />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {dn.created_by_name && (
        <p className="text-sm text-gray-500 mb-2 no-print">
          Prepared by {dn.created_by_name}
        </p>
      )}

      {/* Signed-copy section — rendered ABOVE the document so it's the first
          thing the user sees. `no-print` keeps it out of the printed sheet
          and out of the captured PDF. */}
      <div className="mb-6 no-print">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {!hasSigned ? (
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative bg-white border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              dragOver ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div
              className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 transition-colors ${
                dragOver ? 'bg-amber-200' : 'bg-amber-100'
              }`}
            >
              <Upload className={`h-6 w-6 ${dragOver ? 'text-amber-700' : 'text-amber-600'}`} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {dragOver ? 'Release to upload' : 'Awaiting signed copy'}
            </h3>
            <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
              {dragOver ? (
                'Drop the photo or PDF anywhere on this card.'
              ) : (
                <>
                  Drag a file here or click below to upload a photo / scan of the signed paper.
                  On a phone the button opens the camera directly.
                </>
              )}
            </p>
            {uploadError && (
              <p className="mt-3 text-sm text-red-600">{uploadError}</p>
            )}
            <button
              onClick={handlePickFile}
              disabled={uploading}
              className="mt-5 inline-flex items-center px-5 py-2.5 rounded-lg text-white font-medium shadow-sm hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: primary }}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Signed Copy
                </>
              )}
            </button>
            <p className="mt-3 text-xs text-gray-400">JPG, PNG, or PDF · up to 10 MB</p>
          </div>
        ) : (
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
          >
            {dragOver && (
              <div className="absolute inset-0 z-10 bg-amber-50/95 border-2 border-dashed border-amber-500 rounded-xl flex flex-col items-center justify-center pointer-events-none">
                <Upload className="h-10 w-10 text-amber-600 mb-2" />
                <p className="text-base font-semibold text-amber-700">Release to replace signed copy</p>
              </div>
            )}
            <div className="flex items-center justify-between px-5 py-3 bg-green-50 border-b border-green-100">
              <div className="flex items-center space-x-3 min-w-0">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-green-800">Signed copy on file</p>
                  <p className="text-xs text-green-700 truncate">
                    {dn.signed_at ? new Date(dn.signed_at).toLocaleString() : ''}
                    {dn.signed_by_name ? ` · uploaded by ${dn.signed_by_name}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <a
                  href={dn.signed_file_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Open
                </a>
                <button
                  onClick={handlePickFile}
                  disabled={uploading}
                  className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  title="Replace with a new scan"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                  )}
                  Re-upload
                </button>
                {isAdmin && (
                  <button
                    onClick={handleRemoveSigned}
                    className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50"
                    title="Remove the signed copy"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 bg-gray-50">
              {isPdf ? (
                <div className="flex items-center justify-center bg-white border border-gray-200 rounded-lg p-8 text-center">
                  <div>
                    <p className="text-gray-600 mb-2">Signed PDF attached.</p>
                    <a
                      href={dn.signed_file_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-sm font-medium"
                      style={{ color: primary }}
                    >
                      <ExternalLink className="h-4 w-4 mr-1.5" />
                      Open PDF in new tab
                    </a>
                  </div>
                </div>
              ) : (
                <a
                  href={dn.signed_file_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white border border-gray-200 rounded-lg overflow-hidden"
                  title="Open full size"
                >
                  <img
                    src={dn.signed_file_url || ''}
                    alt="Signed delivery note"
                    className="w-full h-auto max-h-[800px] object-contain mx-auto"
                  />
                </a>
              )}
              {uploadError && (
                <p className="mt-3 text-sm text-red-600 text-center">{uploadError}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <DeliveryNoteDocument
        rootClassName="delivery-note-document shadow-lg rounded-lg"
        data={dn}
        company={{
          name: dn.company_name || '',
          address: dn.company_address,
          tpin: dn.company_tpin,
          logo_url: dn.company_quote_logo || dn.company_logo,
          primary_color: dn.primary_color,
          secondary_color: dn.secondary_color,
        }}
      />

      {!isAdmin && (
        <p className="mt-4 text-xs text-gray-400 no-print">
          Need to edit or delete this delivery note? Ask an admin.
        </p>
      )}
    </div>
  );
};

export default DeliveryNoteView;
