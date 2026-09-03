import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { getContracts, deleteContract, getContract } from '../services/api';
import { generateContractPDF } from '../utils/pdfGenerator';
import { formatContractMoney } from '../utils/contractTemplate';
import { Contract } from '../types';
import {
  FileSignature, Plus, Search, Download, Edit2, Trash2, Eye, X, AlertCircle, Loader2,
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  terminated: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const Contracts: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#1f3b5c', theme === 'dark');

  const [rows, setRows] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<Contract | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const flash = (type: 'success' | 'error', text: string) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 4000); };

  const load = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try { setRows(await getContracts(selectedCompany.id)); }
    catch { flash('error', 'Failed to load contracts.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedCompany]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.contract_number, r.title, r.client_name, r.site].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [rows, search]);

  // Download needs the full record (with company branding + clauses), so fetch
  // it, render off-screen, capture, then clean up.
  const downloadPdf = async (row: Contract) => {
    setBusyId(row.id);
    try {
      const full = await getContract(row.id);
      const ContractDocument = (await import('../components/Contract/ContractDocument')).default;
      const { createRoot } = await import('react-dom/client');
      // Render off-screen into a detached container.
      const holder = document.createElement('div');
      holder.style.position = 'fixed';
      holder.style.left = '-10000px';
      holder.style.top = '0';
      holder.style.width = '820px';
      document.body.appendChild(holder);
      const root = createRoot(holder);
      await new Promise<void>((resolve) => {
        root.render(React.createElement(ContractDocument, { contract: full }));
        setTimeout(resolve, 60);
      });
      await generateContractPDF(full);
      root.unmount();
      document.body.removeChild(holder);
    } catch {
      flash('error', 'Failed to generate PDF.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try { await deleteContract(toDelete.id); setToDelete(null); flash('success', 'Contract deleted.'); load(); }
    catch { flash('error', 'Failed to delete.'); }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: primary }}>
            <FileSignature size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Contracts</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Generate professional client contracts {selectedCompany ? `· ${selectedCompany.name}` : ''}</p>
          </div>
        </div>
        <button onClick={() => navigate('/contracts/new')} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: primary }}>
          <Plus size={16} /> New Contract
        </button>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          <AlertCircle size={16} /> {message.text}
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contracts…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2" />
      </div>

      {!selectedCompany ? (
        <p className="text-gray-500 dark:text-gray-400">Select a company to manage contracts.</p>
      ) : loading ? (
        <div className="flex justify-center py-16 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {['Contract', 'Client', 'Amount', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  {rows.length === 0 ? 'No contracts yet. Click “New Contract” to create one.' : 'No contracts match your search.'}
                </td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/contracts/${r.id}`)} className="text-left">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{r.title}</div>
                      <div className="text-xs text-gray-400">{r.contract_number}{r.site ? ` · ${r.site}` : ''}</div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.client_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {r.payment_amount ? `${formatContractMoney(r.payment_amount, r.currency)}${r.payment_frequency ? ` / ${r.payment_frequency}` : ''}`
                      : r.amount ? formatContractMoney(r.amount, r.currency) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_STYLES[r.status || 'draft']}`}>{r.status || 'draft'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => navigate(`/contracts/${r.id}`)} title="View" className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><Eye size={16} /></button>
                      <button onClick={() => downloadPdf(r)} disabled={busyId === r.id} title="Download PDF" className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40">
                        {busyId === r.id ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                      </button>
                      <button onClick={() => navigate(`/contracts/${r.id}/edit`)} title="Edit" className="p-2 text-gray-400 hover:text-indigo-600"><Edit2 size={16} /></button>
                      {isAdmin && <button onClick={() => setToDelete(r)} title="Delete" className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setToDelete(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Delete contract?</h3>
              <button onClick={() => setToDelete(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">{toDelete.contract_number} · {toDelete.client_name} — this cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setToDelete(null)} className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-red-600 hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contracts;
