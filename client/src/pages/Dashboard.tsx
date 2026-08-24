import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getDashboard, DashboardData } from '../services/api';
import { formatCurrency, formatCompactCurrency } from '../utils/calculations';
import { brandColorFor, hexToRgba } from '../utils/colors';
import {
  FileText, Receipt, DollarSign, TrendingUp, TrendingDown, Wallet, Plus,
  ArrowUpRight, Users, Banknote, Truck,
} from 'lucide-react';

// Animate a number from 0 → target on mount.
const useCountUp = (target: number, duration = 900): number => {
  const [val, setVal] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    let raf = 0; const start = performance.now(); const from = ref.current;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      setVal(v); ref.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
};

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
};

const Dashboard: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const brand = brandColorFor(selectedCompany?.primary_color || '#4f46e5', isDark);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    getDashboard(selectedCompany.id)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const axisTick = { fontSize: 12, fill: isDark ? '#8b8b8b' : '#94a3b8' };
  const gridStroke = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.18)';

  const statusData = useMemo(() => {
    const s = data?.payment_status || { paid: 0, partial: 0, pending: 0 };
    return [
      { name: 'Paid', value: s.paid, color: '#22c55e' },
      { name: 'Partial', value: s.partial, color: '#f59e0b' },
      { name: 'Unpaid', value: s.pending, color: isDark ? '#4b5563' : '#cbd5e1' },
    ];
  }, [data, isDark]);
  const statusTotal = statusData.reduce((a, b) => a + b.value, 0);

  const CAT_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

  if (!selectedCompany) return <div className="text-center py-12">Please select a company</div>;

  const t = data?.totals;
  const trendPct = data?.trend?.invoiced_change_pct ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 qg-rise">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome back, {(user?.name || '').split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {isAdmin
              ? <>Here's what's happening at <span className="font-medium">{selectedCompany.name}</span> — last 12 months.</>
              : <>Your activity at <span className="font-medium">{selectedCompany.name}</span> — last 12 months.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/new-invoice" className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#2e2e2e] text-gray-700 dark:text-gray-200 hover:shadow-sm">
            <Receipt className="h-4 w-4 mr-2" /> New Invoice
          </Link>
          <Link to="/new-quotation" className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-sm hover:opacity-90" style={{ backgroundColor: brand }}>
            <Plus className="h-4 w-4 mr-2" /> New Quotation
          </Link>
        </div>
      </div>

      {loading || !t ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-[#1e1e1e] animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard i={0} label="Total Invoiced" value={t.total_invoiced} money icon={DollarSign} accent={brand}
              trend={trendPct} sub="vs last month" />
            <StatCard i={1} label="Collected" value={t.total_paid} money icon={Wallet} accent="#22c55e"
              sub={`${statusTotal ? Math.round((statusData[0].value / statusTotal) * 100) : 0}% of invoices paid`} />
            <StatCard i={2} label="Outstanding" value={t.outstanding} money icon={TrendingUp} accent="#f59e0b"
              sub="awaiting payment" />
            <StatCard i={3} label="Net (inv − costs)" value={t.net} money icon={ArrowUpRight}
              accent={t.net >= 0 ? '#06b6d4' : '#ef4444'} sub="invoiced − expenses − purchases" />
          </div>

          {/* mini counts row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <MiniStat i={0} label="Quotations" value={t.quotations} icon={FileText} accent={brand} />
            <MiniStat i={1} label="Invoices" value={t.invoices} icon={Receipt} accent="#6366f1" />
            <MiniStat i={2} label="Clients" value={t.clients} icon={Users} accent="#ec4899" />
            {/* Petty cash is a shared company fund — only admins see it; staff
                get their own delivery-note count so their view stays personal. */}
            {isAdmin
              ? <MiniStat i={3} label="Petty Cash" value={t.petty_balance} money icon={Banknote} accent="#22c55e" />
              : <MiniStat i={3} label="Delivery Notes" value={t.delivery_notes} icon={Truck} accent="#22c55e" />}
          </div>

          {/* Revenue area + payment donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2 qg-rise" delay={80}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Revenue</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Invoiced vs expenses over time</p>
                </div>
                <Legend items={[{ c: brand, l: 'Invoiced' }, { c: '#ef4444', l: 'Expenses' }]} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data?.revenue_series} margin={{ left: -8, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={brand} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axisTick} dy={6} />
                  <YAxis tickLine={false} axisLine={false} tick={axisTick} width={48} tickFormatter={compact} />
                  <Tooltip content={<MoneyTooltip />} cursor={{ stroke: gridStroke, strokeWidth: 40 }} />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expGrad)" dot={false} />
                  <Area type="monotone" dataKey="invoiced" stroke={brand} strokeWidth={3} fill="url(#revGrad)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="qg-rise" delay={140}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Payment Status</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Invoices by status</p>
              <div className="relative">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" innerRadius={64} outerRadius={90} paddingAngle={3} cornerRadius={7} stroke="none">
                      {statusData.map((s, idx) => <Cell key={idx} fill={s.color} />)}
                    </Pie>
                    <Tooltip content={<CountTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">{statusTotal}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">invoices</span>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {statusData.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center text-gray-600 dark:text-gray-300">
                      <span className="h-2.5 w-2.5 rounded-full mr-2" style={{ backgroundColor: s.color }} />{s.name}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">{s.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Quotations vs invoices bar + expenses donut + top clients */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="qg-rise" delay={80}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Activity</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Quoted vs invoiced (monthly)</p>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={data?.revenue_series} margin={{ left: -14, right: 4 }} barGap={4}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axisTick} interval={1} dy={4} />
                  <YAxis tickLine={false} axisLine={false} tick={axisTick} width={44} tickFormatter={compact} />
                  <Tooltip content={<MoneyTooltip />} cursor={{ fill: gridStroke }} />
                  <Bar dataKey="quoted" fill={hexToRgba(brand, 0.35)} radius={[5, 5, 0, 0]} />
                  <Bar dataKey="invoiced" fill={brand} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="qg-rise" delay={140}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Expenses</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">By category</p>
              {(!data?.expenses_by_category?.length) ? (
                <Empty label="No expenses recorded yet" />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={data.expenses_by_category} dataKey="amount" nameKey="category" innerRadius={50} outerRadius={80} paddingAngle={2} cornerRadius={6} stroke="none">
                        {data.expenses_by_category.map((_, idx) => <Cell key={idx} fill={CAT_COLORS[idx % CAT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<MoneyTooltip nameKey />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1.5 max-h-24 overflow-y-auto">
                    {data.expenses_by_category.map((c, idx) => (
                      <div key={c.category} className="flex items-center justify-between text-sm">
                        <span className="flex items-center text-gray-600 dark:text-gray-300 truncate">
                          <span className="h-2.5 w-2.5 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: CAT_COLORS[idx % CAT_COLORS.length] }} />
                          <span className="truncate">{c.category}</span>
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white tabular-nums flex-shrink-0 ml-2">{formatCurrency(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card className="qg-rise" delay={200}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Top Clients</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">By total invoiced</p>
              {(!data?.top_clients?.length) ? (
                <Empty label="No invoices yet" />
              ) : (
                <div className="space-y-3.5">
                  {data.top_clients.map((c, idx) => {
                    const max = data.top_clients[0].invoiced || 1;
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-700 dark:text-gray-200 truncate font-medium">{idx + 1}. {c.name}</span>
                          <span className="text-gray-900 dark:text-white tabular-nums ml-2">{formatCurrency(c.invoiced)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(6, (c.invoiced / max) * 100)}%`, backgroundColor: brand }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Recent invoices */}
          <Card className="qg-rise !p-0 overflow-hidden" delay={120}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2e2e2e]">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Invoices</h2>
              <Link to="/invoice-history" className="text-sm font-medium hover:underline" style={{ color: brand }}>View all</Link>
            </div>
            {(!data?.recent_invoices?.length) ? (
              <div className="px-6"><Empty label="No invoices yet" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-white/5">
                    <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <th className="px-6 py-3">Invoice</th>
                      <th className="px-6 py-3">Client</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3 text-right">Amount</th>
                      <th className="px-6 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                    {data.recent_invoices.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-6 py-3.5">
                          <Link to={`/invoice/${r.id}`} className="text-sm font-medium hover:underline" style={{ color: brand }}>{r.invoice_number}</Link>
                        </td>
                        <td className="px-6 py-3.5 text-sm text-gray-900 dark:text-gray-100">{r.client_name}</td>
                        <td className="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400">{new Date(r.date).toLocaleDateString()}</td>
                        <td className="px-6 py-3.5 text-sm font-medium text-gray-900 dark:text-white text-right tabular-nums">{formatCurrency(Number(r.grand_total))}</td>
                        <td className="px-6 py-3.5 text-center"><StatusPill status={r.payment_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

// ---- small building blocks ----

const Card: React.FC<{ className?: string; delay?: number; children: React.ReactNode }> = ({ className = '', delay = 0, children }) => (
  <div className={`bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2e2e2e] shadow-sm p-5 ${className}`} style={{ animationDelay: `${delay}ms` }}>
    {children}
  </div>
);

const StatCard: React.FC<{
  i: number; label: string; value: number; money?: boolean; icon: React.ComponentType<{ className?: string }>;
  accent: string; trend?: number; sub?: string;
}> = ({ i, label, value, money, icon: Icon, accent, trend, sub }) => {
  const v = useCountUp(value);
  const display = money ? formatCompactCurrency(v) : Math.round(v).toLocaleString();
  const full = money ? formatCurrency(value) : Math.round(value).toLocaleString();
  return (
    <div className="qg-rise bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2e2e2e] shadow-sm p-5 transition-transform hover:-translate-y-0.5" style={{ animationDelay: `${i * 70}ms` }}>
      <div className="flex items-start justify-between">
        <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: hexToRgba(accent, 0.14), color: accent }}>
          <Icon className="h-5 w-5" />
        </div>
        {trend !== undefined && (
          <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'}`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-4 tabular-nums truncate" title={full}>{display}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  );
};

const MiniStat: React.FC<{ i: number; label: string; value: number; money?: boolean; icon: React.ComponentType<{ className?: string }>; accent: string }> = ({ i, label, value, money, icon: Icon, accent }) => {
  const v = useCountUp(value);
  return (
    <div className="qg-rise bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2e2e2e] shadow-sm p-4 flex items-center gap-3" style={{ animationDelay: `${i * 60 + 120}ms` }}>
      <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: hexToRgba(accent, 0.14), color: accent }}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums truncate" title={money ? formatCurrency(value) : undefined}>{money ? formatCompactCurrency(v) : Math.round(v).toLocaleString()}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
      </div>
    </div>
  );
};

const Legend: React.FC<{ items: { c: string; l: string }[] }> = ({ items }) => (
  <div className="flex items-center gap-4">
    {items.map((it) => (
      <span key={it.l} className="flex items-center text-xs text-gray-500 dark:text-gray-400">
        <span className="h-2.5 w-2.5 rounded-full mr-1.5" style={{ backgroundColor: it.c }} />{it.l}
      </span>
    ))}
  </div>
);

const Empty: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-40 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">{label}</div>
);

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
    partial: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
    pending: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
  };
  const label = status === 'paid' ? 'Paid' : status === 'partial' ? 'Partial' : 'Unpaid';
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || map.pending}`}>{label}</span>;
};

const MoneyTooltip: React.FC<any> = ({ active, payload, label, nameKey }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-gray-900 text-white text-xs px-3 py-2 shadow-lg">
      {!nameKey && <div className="font-semibold mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.payload?.fill }} />
          <span className="capitalize">{nameKey ? p.name : p.dataKey}</span>
          <span className="ml-auto font-medium">{formatCurrency(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
};

const CountTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl bg-gray-900 text-white text-xs px-3 py-2 shadow-lg">
      <span className="capitalize">{p.name}</span>: <span className="font-medium">{p.value}</span>
    </div>
  );
};

export default Dashboard;
