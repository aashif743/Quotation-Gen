import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Bid, STATUS_LABELS } from '../../services/bidsApi';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ACTIVE = ['draft', 'review', 'approved'];

const dot = (b: Bid) => {
  if (b.status === 'won') return 'bg-emerald-500';
  if (b.status === 'lost') return 'bg-gray-400';
  if (b.status === 'submitted') return 'bg-blue-500';
  if (ACTIVE.includes(b.status) && b.minutes_left != null && b.minutes_left < 3 * 1440) return 'bg-red-500';
  return 'bg-amber-500';
};

/** Month view of bid deadlines (Monday first). */
const DeadlineCalendar: React.FC<{ bids: Bid[]; primary: string }> = ({ bids, primary }) => {
  const navigate = useNavigate();
  const today = new Date();
  const [month, setMonth] = useState(() => {
    // Start on the month of the next open deadline, else this month.
    const next = bids
      .filter((b) => b.deadline && ACTIVE.includes(b.status) && (b.minutes_left ?? -1) >= 0)
      .map((b) => b.deadline as string)
      .sort()[0];
    const d = next ? new Date(next.replace(' ', 'T')) : today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Bid[]>();
    for (const b of bids) {
      if (!b.deadline) continue;
      const k = b.deadline.slice(0, 10);
      m.set(k, [...(m.get(k) || []), b]);
    }
    m.forEach((list) => list.sort((a, b) => String(a.deadline).localeCompare(String(b.deadline))));
    return m;
  }, [bids]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((lead + daysIn) / 7) * 7;
  const key = (d: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const isToday = (d: number) => d === today.getDate() && month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear();
  const step = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => step(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
          <button onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))} className="text-xs underline text-gray-500">Today</button>
        </div>
        <button onClick={() => step(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
        {DAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 border-l border-t border-gray-200">
        {Array.from({ length: cells }, (_, i) => {
          const d = i - lead + 1;
          const inMonth = d >= 1 && d <= daysIn;
          const list = inMonth ? byDay.get(key(d)) || [] : [];
          return (
            <div key={i} className={`min-h-[5.5rem] border-r border-b border-gray-200 p-1 ${inMonth ? 'bg-white' : 'bg-gray-50'}`}>
              {inMonth && (
                <>
                  <div className="flex justify-end">
                    <span className={`text-xs h-6 w-6 flex items-center justify-center rounded-full ${isToday(d) ? 'text-white font-semibold' : 'text-gray-500'}`} style={isToday(d) ? { backgroundColor: primary } : undefined}>{d}</span>
                  </div>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map((b) => (
                      <button key={b.id} onClick={() => navigate(`/tenders/${b.id}`)}
                        title={`${b.bid_number} · ${b.title || 'Untitled'} · ${STATUS_LABELS[b.status]} · ${String(b.deadline).slice(11, 16)}`}
                        className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-gray-800 hover:bg-gray-100">
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dot(b)}`} />
                        <span className="truncate"><span className="hidden sm:inline text-gray-500">{String(b.deadline).slice(11, 16)} </span>{b.title || b.bid_number}</span>
                      </button>
                    ))}
                    {list.length > 3 && <p className="text-[11px] text-gray-500 px-1">+{list.length - 3} more</p>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
        {[['bg-red-500', 'Due within 3 days'], ['bg-amber-500', 'Being prepared'], ['bg-blue-500', 'Submitted'], ['bg-emerald-500', 'Won'], ['bg-gray-400', 'Not won']].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} /> {l}</span>
        ))}
      </div>
    </div>
  );
};

export default DeadlineCalendar;
