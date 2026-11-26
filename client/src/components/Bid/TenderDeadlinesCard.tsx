import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { BidSummary, STATUS_LABELS, STATUS_STYLE, getBidSummary } from '../../services/bidsApi';
import { timeLeftText } from '../../pages/BidWorkspace';

/**
 * Dashboard card: bid deadlines in the next 14 days, bids waiting for review
 * and Bid Profile documents running out. Hidden when there is nothing to show.
 */
const TenderDeadlinesCard: React.FC<{ companyId: number; brand: string }> = ({ companyId, brand }) => {
  const [s, setS] = useState<BidSummary | null>(null);
  useEffect(() => {
    let live = true;
    getBidSummary(companyId).then((x) => { if (live) setS(x); }).catch(() => {});
    return () => { live = false; };
  }, [companyId]);

  if (!s || (!s.upcoming.length && !s.awaiting_review && !s.documents_expired && !s.documents_expiring)) return null;
  return (
    <div className="qg-rise bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2e2e2e] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2e2e2e]">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Gavel className="h-5 w-5 text-gray-400" /> Tender deadlines</h2>
        <Link to="/tenders" className="text-sm font-medium hover:underline" style={{ color: brand }}>View all</Link>
      </div>
      {(s.awaiting_review > 0 || s.documents_expired > 0 || s.documents_expiring > 0) && (
        <div className="px-6 py-3 flex flex-wrap gap-x-5 gap-y-1 text-sm border-b border-gray-100 dark:border-[#2e2e2e]">
          {s.awaiting_review > 0 && <Link to="/tenders" className="inline-flex items-center gap-1.5 text-amber-700"><ShieldCheck className="h-4 w-4" /> {s.awaiting_review} bid{s.awaiting_review === 1 ? '' : 's'} waiting for review</Link>}
          {s.documents_expired > 0 && <Link to="/bid-profile" className="inline-flex items-center gap-1.5 text-red-600"><AlertTriangle className="h-4 w-4" /> {s.documents_expired} certificate{s.documents_expired === 1 ? '' : 's'} expired</Link>}
          {s.documents_expiring > 0 && <Link to="/bid-profile" className="inline-flex items-center gap-1.5 text-amber-700"><Clock className="h-4 w-4" /> {s.documents_expiring} certificate{s.documents_expiring === 1 ? '' : 's'} expiring within 30 days</Link>}
        </div>
      )}
      {s.upcoming.length === 0 ? (
        <p className="px-6 py-4 text-sm text-gray-500">No deadlines in the next 14 days.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
          {s.upcoming.map((b) => {
            const urgent = b.minutes_left < 3 * 1440;
            const d = new Date(b.deadline.replace(' ', 'T'));
            return (
              <li key={b.id}>
                <Link to={`/tenders/${b.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 dark:hover:bg-[#262626]">
                  <div className={`w-12 flex-shrink-0 rounded-lg text-center py-1 ${urgent ? 'bg-red-50 text-red-700' : 'bg-gray-50 dark:bg-[#262626] text-gray-700 dark:text-gray-200'}`}>
                    <div className="text-[10px] font-semibold uppercase">{d.toLocaleDateString('en-GB', { month: 'short' })}</div>
                    <div className="text-lg font-bold leading-tight">{d.getDate()}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{b.title || b.bid_number}</p>
                    <p className="text-xs text-gray-500 truncate">{[b.bid_number, b.procuring_entity].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[b.status]}`}>{STATUS_LABELS[b.status]}</span>
                    <p className={`text-xs mt-1 ${urgent ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{timeLeftText(b.minutes_left)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default TenderDeadlinesCard;
