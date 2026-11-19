import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Mail, AlertCircle } from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { getLetters, Letter } from '../services/lettersApi';
import { fmtLetterDate } from '../components/Letter/LetterDocument';
import { brandColorFor } from '../utils/colors';

/** /letters — the selected company's letters, newest first. */
const Letters: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    getLetters(selectedCompany.id)
      .then((rows) => { setLetters(rows); setError(''); })
      .catch((e) => setError(e?.response?.data?.error || 'Could not load letters.'))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return letters;
    return letters.filter((l) => [l.letter_number, l.subject, l.recipient_name, l.recipient_company, l.reference, l.signer_name]
      .some((f) => (f || '').toLowerCase().includes(t)));
  }, [letters, search]);

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;
  const primary = brandColorFor(selectedCompany.primary_color || '#4f46e5', theme === 'dark');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Letters</h1>
          <p className="text-gray-600 mt-2">Business letters on {selectedCompany.name}'s letterhead, signed and ready as PDF.</p>
        </div>
        <button
          onClick={() => navigate('/letters/new')}
          className="inline-flex items-center whitespace-nowrap px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90 flex-shrink-0"
          style={{ backgroundColor: primary }}
        >
          <Plus className="h-5 w-5 mr-2" /> New Letter
        </button>
      </div>

      {error && <div className="p-4 rounded-lg flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle className="h-5 w-5" /> {error}</div>}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by number, subject, recipient or signer..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
              <p className="text-gray-600 mt-2">Loading letters...</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="h-14 w-14 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{letters.length ? 'No letters match' : 'No letters yet'}</h3>
              <p className="text-gray-600 mb-6">
                {letters.length ? 'Try another search.' : 'Write a letter from a template or let AI draft it, with your letterhead and signature.'}
              </p>
              {!letters.length && (
                <button onClick={() => navigate('/letters/new')} className="inline-flex items-center px-4 py-2 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: primary }}>
                  <Plus className="h-4 w-4 mr-2" /> New Letter
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Date', 'Number', 'Subject', 'To', 'Signed by'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {shown.map((l) => (
                  <tr key={l.id} onClick={() => navigate(`/letters/${l.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{fmtLetterDate(l.letter_date)}</td>
                    <td className="px-6 py-4 text-sm font-semibold whitespace-nowrap" style={{ color: primary }}>{l.letter_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                      <div className="truncate">{l.subject || <span className="text-gray-400">No subject</span>}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{l.recipient_company || l.recipient_name || '—'}</div>
                      {l.recipient_company && l.recipient_name && <div className="text-xs text-gray-500">{l.recipient_name}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{l.signer_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Letters;
