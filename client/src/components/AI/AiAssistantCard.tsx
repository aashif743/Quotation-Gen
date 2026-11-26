import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { aiUnavailableText, AiUsage, getAiUsage } from '../../services/aiApi';

/** Settings → "AI assistant": whether AI is available and this month's use (admins). */
const AiAssistantCard: React.FC<{ primary: string }> = ({ primary }) => {
  const [usage, setUsage] = useState<AiUsage | null>(null);

  useEffect(() => { getAiUsage().then(setUsage).catch(() => {}); }, []);
  if (!usage) return null;

  const s = usage.status;
  const pct = s.monthly_limit > 0 ? Math.min(100, (s.used_this_month / s.monthly_limit) * 100) : 100;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold mb-1 flex items-center gap-2"><Sparkles className="h-5 w-5" style={{ color: primary }} /> AI Assistant</h2>
      <p className="text-sm text-gray-500 mb-5">AI helps your team write letters and, soon, more. Usage is shared by everyone in your organization.</p>

      <div className={`mb-5 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${s.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
        {s.available ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
        {s.available ? 'AI is on for your organization.' : aiUnavailableText(s, true)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p className="text-sm text-gray-500">Used this month</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {s.used_this_month.toLocaleString()} <span className="text-base font-medium text-gray-400">/ {s.monthly_limit.toLocaleString()}</span>
          </p>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">Requests. The count starts again on the 1st of each month.</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">By feature</p>
          {usage.by_feature.length ? usage.by_feature.map((f) => (
            <div key={f.feature} className="flex justify-between text-sm py-1"><span className="text-gray-600">{f.name}</span><span className="tabular-nums">{f.requests}</span></div>
          )) : <p className="text-sm text-gray-400">Not used yet this month.</p>}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">By person</p>
          {usage.by_user.length ? usage.by_user.map((u) => (
            <div key={u.user_id} className="flex justify-between text-sm py-1"><span className="text-gray-600 truncate">{u.name || 'Former user'}</span><span className="tabular-nums">{u.requests}</span></div>
          )) : <p className="text-sm text-gray-400">—</p>}
        </div>
      </div>
    </div>
  );
};

export default AiAssistantCard;
