import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, Loader2, PlugZap, Save, Building } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { AiOrgRow, AiOverview, getAiOverview, testAi, updateOrgAi } from '../services/aiApi';
import FitText from '../components/common/FitText';

const usd = (n: number | string) => `$${(Number(n) || 0).toFixed(Number(n) < 1 ? 4 : 2)}`;
const fmtMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const fmtWhen = (s?: string | null) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const ERROR_TEXT: Record<string, string> = {
  no_credit: 'Credit ran out', bad_key: 'Key not valid', busy: 'AI busy', not_configured: 'Not set up', failed: 'Failed', bad_request: 'Bad request',
};

/** /ai-usage — the platform owner's AI control panel. */
const AiUsage: React.FC = () => {
  const { theme } = useTheme();
  const primary = brandColorFor('#4f46e5', theme === 'dark');
  const [data, setData] = useState<AiOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [limits, setLimits] = useState<Record<number, string>>({});
  const [savingOrg, setSavingOrg] = useState<number | null>(null);

  const load = async () => {
    try {
      const d = await getAiOverview();
      setData(d);
      setLimits(Object.fromEntries(d.organizations.map((o) => [o.id, o.ai_monthly_limit == null ? '' : String(o.ai_monthly_limit)])));
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not load AI usage.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const runTest = async () => {
    setTesting(true);
    setNotice(null);
    try {
      const r = await testAi();
      setNotice({ ok: true, text: `AI is working. ${r.model} answered “${r.reply}” in ${(r.ms / 1000).toFixed(1)} s.` });
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || 'The test failed.' });
    } finally {
      setTesting(false);
      load();
    }
  };

  const save = async (o: AiOrgRow, patch: { ai_enabled?: boolean; ai_monthly_limit?: number | null }) => {
    setSavingOrg(o.id);
    setNotice(null);
    try {
      await updateOrgAi(o.id, patch);
      setNotice({ ok: true, text: `Saved AI settings for ${o.name}.` });
      await load();
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || 'Could not save.' });
    } finally {
      setSavingOrg(null);
    }
  };

  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;
  if (!data) return <div className="max-w-xl mx-auto mt-10 p-4 rounded-lg bg-red-50 text-red-700">{error}</div>;

  const totalRequests = data.organizations.reduce((s, o) => s + Number(o.requests), 0);
  const totalCost = data.organizations.reduce((s, o) => s + Number(o.cost_usd), 0);
  const activeOrgs = data.organizations.filter((o) => Number(o.requests) > 0).length;
  const card = 'bg-white rounded-xl border border-gray-200';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><Sparkles className="h-7 w-7" style={{ color: primary }} /> AI Usage</h1>
        <p className="text-gray-600 mt-1">Switch AI on or off per organization, set monthly limits and follow usage and cost.</p>
      </div>

      {notice && (
        <div className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {notice.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {notice.text}
        </div>
      )}

      {/* Connection */}
      <div className={`${card} p-5 flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-start gap-3 min-w-0">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${data.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            <PlugZap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{data.configured ? 'AI key is set on the server' : 'AI key is not set yet'}</p>
            <p className="text-sm text-gray-500">
              {data.configured
                ? <>Models: {data.models.fast} (quick tasks) and {data.models.smart} (writing). Default limit {data.default_monthly_limit} requests per organization per month.</>
                : <>Add <code className="px-1 rounded bg-gray-100">ANTHROPIC_API_KEY</code> in Hostinger → Environment variables, then restart the app.</>}
            </p>
          </div>
        </div>
        <button
          onClick={runTest}
          disabled={!data.configured || testing}
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: primary }}
          title="Sends one tiny request to check the key and the credit"
        >
          {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlugZap className="h-4 w-4 mr-1.5" />} Test AI connection
        </button>
      </div>

      {/* This month */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Requests this month', value: totalRequests.toLocaleString() },
          { label: 'Estimated cost this month', value: usd(totalCost) },
          { label: 'Organizations using AI', value: `${activeOrgs} of ${data.organizations.length}` },
        ].map((c) => (
          <div key={c.label} className={`${card} p-5`}>
            <p className="text-sm text-gray-500">{c.label}</p>
            <FitText className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{c.value}</FitText>
          </div>
        ))}
      </div>

      {/* Organizations */}
      <div className={card}>
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Organizations</h2>
          <p className="text-sm text-gray-500">Leave the limit empty to use the default ({data.default_monthly_limit}). A limit of 0 stops AI for that organization until next month.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Organization', 'AI', 'Monthly limit', 'Used this month', 'Est. cost', 'Last used'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.organizations.map((o) => {
                const on = Number(o.ai_enabled) === 1;
                const used = Number(o.requests);
                const pct = o.effective_limit > 0 ? Math.min(100, (used / o.effective_limit) * 100) : 100;
                const limitDirty = (limits[o.id] ?? '') !== (o.ai_monthly_limit == null ? '' : String(o.ai_monthly_limit));
                return (
                  <tr key={o.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                        <Building className="h-4 w-4 text-gray-400" /> {o.name}
                        {Number(o.is_demo) === 1 && <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">demo</span>}
                      </div>
                      {Number(o.errors) > 0 && <div className="text-xs text-red-600 ml-6">{o.errors} failed request{Number(o.errors) === 1 ? '' : 's'}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        disabled={savingOrg === o.id}
                        onClick={() => save(o, { ai_enabled: !on })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-gray-300 dark:!bg-gray-600'}`}
                        title={on ? 'AI on — click to switch off' : 'AI off — click to switch on'}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={limits[o.id] ?? ''}
                          onChange={(e) => setLimits((l) => ({ ...l, [o.id]: e.target.value }))}
                          placeholder={`Default (${data.default_monthly_limit})`}
                          className="w-32 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {limitDirty && (
                          <button
                            onClick={() => save(o, { ai_monthly_limit: limits[o.id] === '' ? null : Number(limits[o.id]) })}
                            disabled={savingOrg === o.id}
                            className="p-1.5 rounded-lg text-white disabled:opacity-50"
                            style={{ backgroundColor: primary }}
                            title="Save limit"
                          >
                            {savingOrg === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 min-w-[10rem]">
                      <div className="text-sm text-gray-900 tabular-nums">{used.toLocaleString()} <span className="text-gray-400">/ {o.effective_limit.toLocaleString()}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700 tabular-nums">{usd(o.cost_usd)}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtWhen(o.last_used)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${card} p-5`}>
          <h3 className="font-semibold text-gray-900 mb-3">By feature (this month)</h3>
          {data.features.length ? data.features.map((f) => (
            <div key={f.feature} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-gray-700">{f.name}</span>
              <span className="tabular-nums text-gray-900">{Number(f.requests).toLocaleString()} · {usd(f.cost_usd)}</span>
            </div>
          )) : <p className="text-sm text-gray-400">No AI use yet this month.</p>}
        </div>
        <div className={`${card} p-5`}>
          <h3 className="font-semibold text-gray-900 mb-3">Last 6 months</h3>
          {data.months.length ? data.months.map((m) => (
            <div key={m.month} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-gray-700">{fmtMonth(m.month)}</span>
              <span className="tabular-nums text-gray-900">{Number(m.requests).toLocaleString()} · {usd(m.cost_usd)}</span>
            </div>
          )) : <p className="text-sm text-gray-400">No AI use yet.</p>}
        </div>
        <div className={`${card} p-5`}>
          <h3 className="font-semibold text-gray-900 mb-3">Recent problems</h3>
          {data.recent_errors.length ? data.recent_errors.map((e, i) => (
            <div key={i} className="text-sm py-1.5 border-b border-gray-100 last:border-0">
              <div className="flex justify-between gap-2">
                <span className="text-red-600 font-medium">{ERROR_TEXT[e.error] || e.error}</span>
                <span className="text-gray-400 text-xs whitespace-nowrap">{fmtWhen(e.created_at)}</span>
              </div>
              <div className="text-xs text-gray-500 truncate">{[e.organization, e.user_name, e.feature].filter(Boolean).join(' · ')}</div>
            </div>
          )) : <p className="text-sm text-gray-400">No problems.</p>}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Costs are estimates from token counts. Your Anthropic console shows the exact amounts charged.
      </p>
    </div>
  );
};

export default AiUsage;
