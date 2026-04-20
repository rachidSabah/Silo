'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface Citation {
  id: string;
  directory_name: string;
  directory_url: string | null;
  listed_name: string | null;
  listed_address: string | null;
  listed_phone: string | null;
  nap_consistent: number;
  sync_status: string;
  last_checked: string | null;
}

export default function CitationRadar() {
  const { project, token } = useStore();
  const [citations, setCitations] = useState<Citation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<{ consistency_score: number; issues: Array<{ directory: string; field: string; expected: string; found: string }>; recommendations: string[] } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [newDirUrl, setNewDirUrl] = useState('');
  const [newListedName, setNewListedName] = useState('');
  const [newListedAddr, setNewListedAddr] = useState('');
  const [newListedPhone, setNewListedPhone] = useState('');

  const authFetch = useCallback((url: string, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options?.headers },
    });
  }, [token]);

  useEffect(() => {
    if (!project?.id) return;
    authFetch(`/api/citations?project_id=${project.id}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCitations(data); })
      .catch(() => {});
  }, [project?.id, authFetch]);

  const handleAddCitation = async () => {
    if (!project?.id || !newDirName) return;
    try {
      const res = await authFetch('/api/citations', {
        method: 'POST',
        body: JSON.stringify({
          project_id: project.id, directory_name: newDirName,
          directory_url: newDirUrl || null, listed_name: newListedName || null,
          listed_address: newListedAddr || null, listed_phone: newListedPhone || null,
          nap_consistent: 1, sync_status: 'pending',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCitations(prev => [...prev, {
          id: 'new', directory_name: newDirName, directory_url: newDirUrl || null,
          listed_name: newListedName || null, listed_address: newListedAddr || null,
          listed_phone: newListedPhone || null, nap_consistent: 1, sync_status: 'pending', last_checked: null,
        }]);
        setShowAddForm(false);
        setNewDirName(''); setNewDirUrl(''); setNewListedName(''); setNewListedAddr(''); setNewListedPhone('');
      }
    } catch (err) { console.error('Add citation failed:', err); }
  };

  const handleAnalyze = async () => {
    if (!project?.id) return;
    setAnalyzing(true);
    try {
      const res = await authFetch('/api/citations/analyze', {
        method: 'POST',
        body: JSON.stringify({ project_id: project.id }),
      });
      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (err) { console.error('Analyze failed:', err); }
    finally { setAnalyzing(false); }
  };

  const consistentCount = citations.filter(c => c.nap_consistent === 1).length;
  const consistencyPct = citations.length > 0 ? Math.round((consistentCount / citations.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">📡 Citation Radar</h2>
          <p className="text-slate-400 text-sm mt-1">Track NAP consistency across directories and citation sources</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAnalyze} disabled={analyzing || citations.length === 0}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs disabled:opacity-50">
            {analyzing ? '🔍 Analyzing...' : '🔍 AI Analyze'}
          </button>
          <button onClick={() => setShowAddForm(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs">+ Add Citation</button>
        </div>
      </div>

      {/* Consistency Score */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{citations.length}</p>
          <p className="text-[10px] text-slate-500 uppercase">Total Citations</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
          <p className={`text-3xl font-bold ${consistencyPct >= 80 ? 'text-emerald-400' : consistencyPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{consistencyPct}%</p>
          <p className="text-[10px] text-slate-500 uppercase">NAP Consistent</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{citations.length - consistentCount}</p>
          <p className="text-[10px] text-slate-500 uppercase">Inconsistencies</p>
        </div>
      </div>

      {/* Add Citation Form */}
      {showAddForm && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-white">Add Citation</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={newDirName} onChange={e => setNewDirName(e.target.value)} placeholder="Directory name (e.g., Yelp)" className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
            <input value={newDirUrl} onChange={e => setNewDirUrl(e.target.value)} placeholder="Listing URL" className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
            <input value={newListedName} onChange={e => setNewListedName(e.target.value)} placeholder="Listed business name" className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
            <input value={newListedAddr} onChange={e => setNewListedAddr(e.target.value)} placeholder="Listed address" className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
            <input value={newListedPhone} onChange={e => setNewListedPhone(e.target.value)} placeholder="Listed phone" className="col-span-2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-1.5 bg-slate-700 text-white rounded-lg text-xs">Cancel</button>
            <button onClick={handleAddCitation} disabled={!newDirName} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs disabled:opacity-50">Add</button>
          </div>
        </div>
      )}

      {/* Citation List */}
      <div className="space-y-2">
        {citations.map(c => (
          <div key={c.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-medium">{c.directory_name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${c.nap_consistent ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                  {c.nap_consistent ? '✓ Consistent' : '✗ Inconsistent'}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-0.5">{c.listed_name || 'No name listed'} • {c.listed_address || 'No address'}</p>
            </div>
            <div className="text-right">
              <p className={`text-xs ${c.sync_status === 'synced' ? 'text-emerald-400' : c.sync_status === 'pending' ? 'text-amber-400' : 'text-red-400'}`}>{c.sync_status}</p>
            </div>
          </div>
        ))}
      </div>

      {/* AI Analysis */}
      {analysis && (
        <div className="bg-slate-800/50 border border-amber-500/30 rounded-xl p-5 space-y-4">
          <h3 className="text-lg font-bold text-white">🤖 AI NAP Analysis</h3>
          <div className="bg-slate-900 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-amber-400">{analysis.consistency_score}%</p>
            <p className="text-[10px] text-slate-500 uppercase">Consistency Score</p>
          </div>
          {analysis.issues.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-white mb-2">Issues Found</h4>
              <div className="space-y-2">
                {analysis.issues.map((issue, idx) => (
                  <div key={idx} className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs">
                    <span className="text-red-300 font-medium">{issue.directory}</span>: <span className="text-slate-300">{issue.field} — expected "{issue.expected}", found "{issue.found}"</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-white mb-2">Recommendations</h4>
              <ul className="space-y-1">
                {analysis.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-slate-300 text-xs flex items-start gap-2">
                    <span className="text-amber-400">→</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {citations.length === 0 && (
        <div className="text-center py-16 bg-slate-800/30 border border-slate-700/50 rounded-2xl">
          <div className="text-5xl mb-4">📡</div>
          <h3 className="text-xl font-bold text-white mb-2">No Citations Tracked</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Add your business listings from directories like Yelp, Bing, Apple Maps, and more to track NAP consistency.</p>
        </div>
      )}
    </div>
  );
}
