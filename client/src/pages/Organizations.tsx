import React, { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { getOrganizations, createOrganization, updateOrganization } from '../services/api';
import { Organization } from '../types';
import { Building, Plus, X, AlertCircle, Users as UsersIcon, Briefcase, Power, Loader2 } from 'lucide-react';

const Organizations: React.FC = () => {
  const { theme } = useTheme();
  const primary = brandColorFor('#4f46e5', theme === 'dark');

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', admin_name: '', admin_email: '', admin_password: '' });

  const load = async () => {
    setLoading(true);
    try {
      setOrgs(await getOrganizations());
    } catch {
      setMessage({ type: 'error', text: 'Failed to load organizations.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ name: '', admin_name: '', admin_email: '', admin_password: '' }); setError(''); setOpen(true); };

  const submit = async () => {
    if (!form.name.trim()) { setError('Organization name is required.'); return; }
    if (!form.admin_name.trim() || !form.admin_email.trim() || !form.admin_password) { setError('Admin name, email and password are required.'); return; }
    if (form.admin_password.length < 6) { setError('Admin password must be at least 6 characters.'); return; }
    setSaving(true);
    setError('');
    try {
      await createOrganization(form);
      setOpen(false);
      setMessage({ type: 'success', text: `Created "${form.name}" with its first admin. They can now log in.` });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not create the organization.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (o: Organization) => {
    const next = o.status === 'active' ? 'suspended' : 'active';
    if (!window.confirm(`${next === 'suspended' ? 'Suspend' : 'Reactivate'} "${o.name}"?`)) return;
    try {
      await updateOrganization(o.id, { status: next });
      setMessage({ type: 'success', text: `"${o.name}" is now ${next}.` });
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.error || 'Could not update the organization.' });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-600 mt-2">Each organization is a separate customer with its own users, companies and data.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center px-4 py-2 rounded-lg text-white shadow-sm hover:opacity-90" style={{ backgroundColor: primary }}>
          <Plus className="h-5 w-5 mr-2" /> New Organization
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center space-x-2 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto" />
            <p className="text-gray-600 mt-2">Loading organizations...</p>
          </div>
        ) : orgs.length === 0 ? (
          <div className="p-12 text-center">
            <Building className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No organizations yet</h3>
            <p className="text-gray-600">Create one to onboard your first customer.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Users</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Companies</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orgs.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-gray-900">{o.name}</div>
                    <div className="text-xs text-gray-500">Created {o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</div>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">
                    <span className="inline-flex items-center"><UsersIcon className="h-3.5 w-3.5 mr-1 text-gray-400" />{o.user_count ?? 0}</span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-700">
                    <span className="inline-flex items-center"><Briefcase className="h-3.5 w-3.5 mr-1 text-gray-400" />{o.company_count ?? 0}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${o.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {o.status === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => toggleStatus(o)} className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50" title={o.status === 'active' ? 'Suspend' : 'Reactivate'}>
                      <Power className="h-4 w-4 mr-1.5" />{o.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">New Organization</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
              <Field label="Organization name *"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Beta Traders Ltd" /></Field>
              <div className="pt-2 mt-2 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">First admin for this organization</p>
                <div className="space-y-3">
                  <Field label="Admin name *"><input className={inputCls} value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} /></Field>
                  <Field label="Admin email *"><input className={inputCls} type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} placeholder="admin@customer.com" /></Field>
                  <Field label="Temporary password *"><input className={inputCls} value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder="At least 6 characters" /></Field>
                </div>
                <p className="text-xs text-gray-500 mt-2">They log in at the same URL and set up their own companies + staff. Data is fully isolated from other organizations.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button onClick={() => setOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={submit} disabled={saving} className="inline-flex items-center px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: primary }}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{saving ? 'Creating...' : 'Create organization'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>
);

export default Organizations;
