import React, { useEffect, useState } from 'react';
import { getStorageUsage, StorageUsage } from '../services/api';
import { Database, HardDrive, RefreshCw, Folder, AlertCircle } from 'lucide-react';

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 2 : 1)} ${units[i]}`;
};

const Storage: React.FC = () => {
  const [data, setData] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getStorageUsage());
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load storage usage.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const largest = data?.database.tables.reduce((m, t) => Math.max(m, t.size_bytes), 0) || 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Storage Usage</h1>
          <p className="text-gray-600 mt-2">
            Live view of database tables and uploaded files. PDFs are generated in the browser and are not stored here.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center">
          <div className="p-3 rounded-lg bg-green-100">
            <Database className="h-6 w-6 text-green-600" />
          </div>
          <div className="ml-4 min-w-0">
            <p className="text-sm font-medium text-gray-600">Database</p>
            <p className="text-2xl font-bold text-gray-900">
              {data ? formatBytes(data.database.total_bytes) : '—'}
            </p>
            {data && <p className="text-xs text-gray-500 truncate">{data.database.name}</p>}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center">
          <div className="p-3 rounded-lg bg-amber-100">
            <HardDrive className="h-6 w-6 text-amber-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Uploads</p>
            <p className="text-2xl font-bold text-gray-900">
              {data ? formatBytes(data.uploads.total_bytes) : '—'}
            </p>
            <p className="text-xs text-gray-500">
              {data ? `${data.uploads.file_count} file${data.uploads.file_count === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center">
          <div className="p-3 rounded-lg bg-blue-100">
            <Folder className="h-6 w-6 text-blue-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">Total Footprint</p>
            <p className="text-2xl font-bold text-gray-900">
              {data ? formatBytes(data.database.total_bytes + data.uploads.total_bytes) : '—'}
            </p>
            <p className="text-xs text-gray-500">Database + uploads</p>
          </div>
        </div>
      </div>

      {/* Per-table breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Database tables</h2>
          <p className="text-sm text-gray-500 mt-0.5">Rows and storage per table on Hostinger MySQL.</p>
        </div>

        {loading && !data ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto" />
            <p className="text-gray-600 mt-2">Loading…</p>
          </div>
        ) : data ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Table</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Rows</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Index</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Share</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.database.tables.map((t) => {
                  const pct = largest ? (t.size_bytes / largest) * 100 : 0;
                  return (
                    <tr key={t.name} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{t.name}</td>
                      <td className="px-6 py-3 text-sm text-right tabular-nums text-gray-700">{t.row_count.toLocaleString()}</td>
                      <td className="px-6 py-3 text-sm text-right tabular-nums text-gray-600">{formatBytes(t.data_bytes)}</td>
                      <td className="px-6 py-3 text-sm text-right tabular-nums text-gray-600">{formatBytes(t.index_bytes)}</td>
                      <td className="px-6 py-3 text-sm text-right tabular-nums font-semibold text-gray-900">{formatBytes(t.size_bytes)}</td>
                      <td className="px-6 py-3">
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-6 py-3 text-sm font-semibold text-gray-900">Total</td>
                  <td className="px-6 py-3 text-sm text-right tabular-nums font-semibold text-gray-900">
                    {data.database.tables.reduce((s, t) => s + t.row_count, 0).toLocaleString()}
                  </td>
                  <td colSpan={2} />
                  <td className="px-6 py-3 text-sm text-right tabular-nums font-bold text-gray-900">
                    {formatBytes(data.database.total_bytes)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">Quick tips</p>
        <ul className="list-disc list-inside space-y-1 text-blue-900/90">
          <li>PDFs are generated in the browser and downloaded to the user — they never sit on Hostinger.</li>
          <li>To reclaim space after deleting many records, run <code className="bg-white/60 px-1 rounded">OPTIMIZE TABLE</code> in phpMyAdmin.</li>
          <li>The "Uploads" total only includes admin-uploaded company logos saved via Settings (not the bundled ones in <code className="bg-white/60 px-1 rounded">public/Company_Logos</code>).</li>
        </ul>
      </div>
    </div>
  );
};

export default Storage;
