import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getContract } from '../services/api';
import { generateContractPDF } from '../utils/pdfGenerator';
import ContractDocument from '../components/Contract/ContractDocument';
import { Contract } from '../types';
import { ArrowLeft, Download, Edit2, Printer, Loader2 } from 'lucide-react';

const ContractView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try { setContract(await getContract(Number(id))); }
      catch { setContract(null); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const handleDownload = async () => {
    if (!contract) return;
    setDownloading(true);
    try { await generateContractPDF(contract); }
    catch { /* handled in generator */ }
    finally { setDownloading(false); }
  };

  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;
  if (!contract) return (
    <div className="max-w-2xl mx-auto p-6 text-center text-gray-500">
      Contract not found. <button onClick={() => navigate('/contracts')} className="text-indigo-600 underline">Back to contracts</button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <style>{`@media print { .contract-toolbar { display: none !important; } .contract-print-area { box-shadow: none !important; } body { background: #fff !important; } }`}</style>

      <div className="contract-toolbar flex items-center justify-between mb-6 gap-3 flex-wrap">
        <button onClick={() => navigate('/contracts')} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
          <ArrowLeft size={18} /> Back to contracts
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/contracts/${id}/edit`)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Edit2 size={15} /> Edit
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Printer size={15} /> Print
          </button>
          <button onClick={handleDownload} disabled={downloading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ background: contract.primary_color || '#1f3b5c' }}>
            {downloading ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />} Download PDF
          </button>
        </div>
      </div>

      <div className="contract-print-area bg-white shadow-lg rounded-lg overflow-hidden mx-auto" style={{ maxWidth: 820 }}>
        <ContractDocument contract={contract} />
      </div>
    </div>
  );
};

export default ContractView;
