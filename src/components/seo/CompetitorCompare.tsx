'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface GeoGridScan {
  id: string;
  keyword: string;
  grid_size: number;
  radius: number;
  business_name: string | null;
  avg_rank: number | null;
  total_nodes: number | null;
  nodes_found: number | null;
  status: string;
}

export default function CompetitorCompare() {
  const { project, token } = useStore();
  const [scans, setScans] = useState<GeoGridScan[]>([]);
  const [scanA, setScanA] = useState<string>('');
  const [scanB, setScanB] = useState<string>('');
  const [nodesA, setNodesA] = useState<Array<any>>([]);
  const [nodesB, setNodesB] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);

  const authFetch = useCallback((url: string, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options?.headers },
    });
  }, [token]);

  useEffect(() => {
    if (!project?.id) return;
    authFetch(`/api/geogrid/scans?project_id=${project.id}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) { setScans(data.filter((s: GeoGridScan) => s.status === 'completed')); if (data.length >= 2) { setScanA(data[0].id); setScanB(data[1].id); } } })
      .catch(() => {});
  }, [project?.id, authFetch]);

  const handleCompare = async () => {
    if (!scanA || !scanB) return;
    setLoading(true);
    try {
      const [resA, resB] = await Promise.all([
        authFetch(`/api/geogrid/nodes?scan_id=${scanA}`).then(r => r.json()),
        authFetch(`/api/geogrid/nodes?scan_id=${scanB}`).then(r => r.json()),
      ]);
      setNodesA(Array.isArray(resA) ? resA : []);
      setNodesB(Array.isArray(resB) ? resB : []);
    } catch (err) { console.error('Compare failed:', err); }
    finally { setLoading(false); }
  };

  const scanAMeta = scans.find(s => s.id === scanA);
  const scanBMeta = scans.find(s => s.id === scanB);

  const calcAvg = (nodes: Array<any>) => {
    const found = nodes.filter(n => n.rank !== null);
    return found.length > 0 ? (found.reduce((sum, n) => sum + n.rank, 0) / found.length).toFixed(1) : 'N/A';
  };

  const calcVisibility = (nodes: Array<any>) => {
    if (nodes.length === 0) return 0;
    return Math.round((nodes.filter(n => n.rank !== null && n.rank <= 10).length / nodes.length) * 100);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">⚖️ Competitor Compare</h2>
        <p className="text-slate-400 text-sm mt-1">Side-by-side comparison of GeoGrid scan results</p>
      </div>

      {/* Scan Selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Scan A</label>
          <select value={scanA} onChange={e => setScanA(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm">
            {scans.map(s => <option key={s.id} value={s.id}>{s.keyword} — {s.business_name || 'Unknown'}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Scan B</label>
          <select value={scanB} onChange={e => setScanB(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm">
            {scans.map(s => <option key={s.id} value={s.id}>{s.keyword} — {s.business_name || 'Unknown'}</option>)}
          </select>
        </div>
      </div>

      <button onClick={handleCompare} disabled={!scanA || !scanB || loading}
        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
        {loading ? 'Loading...' : '⚖️ Compare Scans'}
      </button>

      {/* Comparison Results */}
      {(nodesA.length > 0 || nodesB.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {/* Scan A */}
          <div className="bg-slate-800/50 border border-blue-500/30 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-blue-300">{scanAMeta?.business_name || 'Scan A'}</h3>
            <p className="text-slate-500 text-xs">{scanAMeta?.keyword}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-blue-400">#{calcAvg(nodesA)}</p>
                <p className="text-[9px] text-slate-500 uppercase">Avg Rank</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-blue-400">{calcVisibility(nodesA)}%</p>
                <p className="text-[9px] text-slate-500 uppercase">Visibility</p>
              </div>
            </div>
            {/* Rank distribution */}
            <div className="space-y-1">
              {[
                { label: 'Top 3', count: nodesA.filter(n => n.rank && n.rank <= 3).length, color: 'bg-emerald-500' },
                { label: '4-10', count: nodesA.filter(n => n.rank && n.rank > 3 && n.rank <= 10).length, color: 'bg-amber-500' },
                { label: '10+', count: nodesA.filter(n => n.rank && n.rank > 10).length, color: 'bg-red-500' },
                { label: 'Not Found', count: nodesA.filter(n => n.rank === null).length, color: 'bg-gray-500' },
              ].map(bucket => (
                <div key={bucket.label} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-slate-400">{bucket.label}</span>
                  <div className="flex-1 bg-slate-700 rounded-full h-2">
                    <div className={`${bucket.color} h-2 rounded-full`} style={{ width: `${nodesA.length > 0 ? (bucket.count / nodesA.length) * 100 : 0}%` }} />
                  </div>
                  <span className="w-6 text-right text-slate-300">{bucket.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scan B */}
          <div className="bg-slate-800/50 border border-purple-500/30 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-purple-300">{scanBMeta?.business_name || 'Scan B'}</h3>
            <p className="text-slate-500 text-xs">{scanBMeta?.keyword}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-purple-400">#{calcAvg(nodesB)}</p>
                <p className="text-[9px] text-slate-500 uppercase">Avg Rank</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-purple-400">{calcVisibility(nodesB)}%</p>
                <p className="text-[9px] text-slate-500 uppercase">Visibility</p>
              </div>
            </div>
            <div className="space-y-1">
              {[
                { label: 'Top 3', count: nodesB.filter(n => n.rank && n.rank <= 3).length, color: 'bg-emerald-500' },
                { label: '4-10', count: nodesB.filter(n => n.rank && n.rank > 3 && n.rank <= 10).length, color: 'bg-amber-500' },
                { label: '10+', count: nodesB.filter(n => n.rank && n.rank > 10).length, color: 'bg-red-500' },
                { label: 'Not Found', count: nodesB.filter(n => n.rank === null).length, color: 'bg-gray-500' },
              ].map(bucket => (
                <div key={bucket.label} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-slate-400">{bucket.label}</span>
                  <div className="flex-1 bg-slate-700 rounded-full h-2">
                    <div className={`${bucket.color} h-2 rounded-full`} style={{ width: `${nodesB.length > 0 ? (bucket.count / nodesB.length) * 100 : 0}%` }} />
                  </div>
                  <span className="w-6 text-right text-slate-300">{bucket.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {scans.length < 2 && (
        <div className="text-center py-16 bg-slate-800/30 border border-slate-700/50 rounded-2xl">
          <div className="text-5xl mb-4">⚖️</div>
          <h3 className="text-xl font-bold text-white mb-2">Need At Least 2 Scans</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Run GeoGrid scans for different keywords or locations first, then compare them side-by-side here.</p>
        </div>
      )}
    </div>
  );
}
