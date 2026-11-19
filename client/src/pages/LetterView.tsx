import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer, Edit2, Trash2, Copy, Loader2, AlertCircle, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { deleteLetter, duplicateLetter, getLetter, Letter } from '../services/lettersApi';
import LetterDocument, { fmtLetterDate } from '../components/Letter/LetterDocument';
import { brandColorFor } from '../utils/colors';
import { generateDocumentPDF, pdfFileSegment } from '../utils/pdfGenerator';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** /letters/:id */
const LetterView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [letter, setLetter] = useState<Letter | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLoading(true);
    getLetter(Number(id))
      .then(setLetter)
      .catch((e) => setError(e?.response?.data?.error || 'Could not load the letter.'))
      .finally(() => setLoading(false));
  }, [id]);

  useDocumentTitle(letter ? `Letter ${letter.letter_number}${letter.subject ? ` — ${letter.subject}` : ''}` : null);

  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;
  if (!letter) {
    return (
      <div className="max-w-xl mx-auto mt-10 p-4 rounded-lg bg-red-50 text-red-700 flex items-center gap-2">
        <AlertCircle size={18} /> {error || 'Letter not found.'}
      </div>
    );
  }

  const primary = brandColorFor(letter.primary_color || '#4f46e5', theme === 'dark');
  const canEdit = isAdmin || letter.created_by === user?.id;
  const to = letter.recipient_company || letter.recipient_name || '';

  const download = async () => {
    setBusy('pdf');
    setError('');
    try {
      const name = [letter.letter_number, to || letter.subject].filter(Boolean).map((s) => pdfFileSegment(String(s))).join('_');
      await generateDocumentPDF('.letter-document', `${name || 'Letter'}.pdf`);
    } catch {
      setError('Could not create the PDF. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const copy = async () => {
    setBusy('copy');
    try {
      const c = await duplicateLetter(letter.id);
      navigate(`/letters/${c.id}/edit`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not copy the letter.');
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await deleteLetter(letter.id);
      navigate('/letters');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not delete the letter.');
      setBusy('');
      setConfirmDelete(false);
    }
  };

  const btn = 'inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
  const outline = `${btn} border border-gray-300 text-gray-700 bg-white hover:bg-gray-50`;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/letters')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Back to letters"><ArrowLeft size={20} /></button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{letter.subject || `Letter ${letter.letter_number}`}</h1>
            <p className="text-sm text-gray-500 truncate">
              {letter.letter_number} · {fmtLetterDate(letter.letter_date)}{to ? ` · to ${to}` : ''}{letter.created_by_name ? ` · by ${letter.created_by_name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && <Link to={`/letters/${letter.id}/edit`} className={outline}><Edit2 className="h-4 w-4 mr-1.5" /> Edit</Link>}
          {canEdit && (
            <button onClick={copy} disabled={!!busy} className={outline} title="Make a copy to use again">
              {busy === 'copy' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Copy className="h-4 w-4 mr-1.5" />} Copy
            </button>
          )}
          <button onClick={() => window.print()} className={outline}><Printer className="h-4 w-4 mr-1.5" /> Print</button>
          <button onClick={download} disabled={!!busy} className={`${btn} text-white`} style={{ backgroundColor: primary }}>
            {busy === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            Download PDF
          </button>
          <Link to="/letters/new" className={outline} title="New letter"><Plus className="h-4 w-4" /></Link>
          {isAdmin && (
            <button onClick={() => setConfirmDelete(true)} disabled={!!busy} className={`${btn} text-red-600 hover:bg-red-50`} title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700 no-print"><AlertCircle size={16} /> {error}</div>}

      <div className="shadow-lg rounded-lg overflow-hidden bg-white">
        <LetterDocument
          rootClassName="letter-document"
          data={{ ...letter, date: letter.letter_date }}
          company={{
            name: letter.company_name || '',
            address: letter.company_address,
            tpin: letter.company_tpin,
            logo_url: letter.company_quote_logo || letter.company_logo,
            primary_color: letter.primary_color,
            secondary_color: letter.secondary_color,
            template: letter.company_template,
            letterhead: letter.company_letterhead,
            letter_details: letter.company_letter_details,
          }}
        />
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4 no-print" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Delete letter {letter.letter_number}?</h3>
            <p className="mt-2 text-sm text-gray-600">You can restore it from Recently Deleted for 30 days.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
              <button onClick={remove} disabled={busy === 'delete'} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">
                {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LetterView;
