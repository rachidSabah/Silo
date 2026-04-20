'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';

interface GeoGridScan {
  id: string;
  keyword: string;
  grid_size: number;
  radius: number;
  business_name: string | null;
  status: string;
  avg_rank: number | null;
  total_nodes: number | null;
  nodes_found: number | null;
}

interface AnalysisResult {
  overall_assessment: string;
  avg_rank: number | null;
  visibility_score: number;
  quadrants: {
    northwest: { avg_rank: number; assessment: string };
    northeast: { avg_rank: number; assessment: string };
    southwest: { avg_rank: number; assessment: string };
    southeast: { avg_rank: number; assessment: string };
  };
  action_plan: Array<{ priority: string; action: string; details: string }>;
  gbp_optimizations: string[];
  content_suggestions: string[];
}

export default function LocalScanAnalyzer() {
  const { project, token } = useStore();
  const [scans, setScans] = useState<GeoGridScan[]>([]);
  const [selectedScanId, setSelectedScanId] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

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
      .then(data => { if (Array.isArray(data)) { setScans(data.filter((s: GeoGridScan) => s.status === 'completed')); if (data.length > 0) setSelectedScanId(data[0].id); } })
      .catch(() => {});
  }, [project?.id, authFetch]);

  const handleAnalyze = async () => {
    if (!selectedScanId) return;
    setAnalyzing(true);
    setError('');
    setAnalysis(null);
    try {
      const res = await authFetch('/api/geogrid/analyze', {
        method: 'POST',
        body: JSON.stringify({ scan_id: selectedScanId }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setAnalysis(data.analysis);
    } catch (err) {
      setError('Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const priorityColors: Record<string, string> = {
    high: 'bg-red-500/20 text-red-300 border-red-500/30',
    medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    low: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">🔍 Local Scan Analyzer</h2>
        <p className="text-slate-400 text-sm mt-1">AI-powered analysis of your GeoGrid scan results with actionable recommendations</p>
      </div>

      {/* Scan Selector + Analyze Button */}
      <div className="flex items-center gap-3">
        <select value={selectedScanId} onChange={e => setSelectedScanId(e.target.value)}
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm">
          <option value="">Select a completed scan...</option>
          {scans.map(s => (
            <option key={s.id} value={s.id}>{s.keyword} — {s.grid_size}x{s.grid_size} grid (avg #{s.avg_rank || 'N/A'})</option>
          ))}
        </select>
        <button onClick={handleAnalyze} disabled={!selectedScanId || analyzing}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 whitespace-nowrap">
          {analyzing ? '🔍 Analyzing...' : '🔍 Analyze'}
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">{error}</div>}

      {analysis && (
        <div className="space-y-6">
          {/* Overview */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-bold text-white mb-3">Overall Assessment</h3>
            <p className="text-slate-300 text-sm leading-relaxed">{analysis.overall_assessment}</p>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="bg-slate-900 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{analysis.avg_rank ? `#${analysis.avg_rank}` : 'N/A'}</p>
                <p className="text-[10px] text-slate-500 uppercase">Avg Rank</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{analysis.visibility_score}%</p>
                <p className="text-[10px] text-slate-500 uppercase">Visibility</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">{analysis.action_plan.length}</p>
                <p className="text-[10px] text-slate-500 uppercase">Actions</p>
              </div>
            </div>
          </div>

          {/* Quadrant Analysis */}
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(analysis.quadrants).map(([name, data]) => (
              <div key={name} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-white capitalize">{name.replace('north', 'North ').replace('south', 'South ')}</h4>
                  <span className={`text-sm font-bold ${data.avg_rank && data.avg_rank <= 5 ? 'text-emerald-400' : data.avg_rank && data.avg_rank <= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                    {data.avg_rank ? `#${data.avg_rank}` : 'N/A'}
                  </span>
                </div>
                <p className="text-slate-400 text-xs">{data.assessment || 'No data'}</p>
              </div>
            ))}
          </div>

          {/* Action Plan */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h3 className="text-lg font-bold text-white mb-4">📋 Action Plan</h3>
            <div className="space-y-3">
              {analysis.action_plan.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-slate-900/50 rounded-lg p-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${priorityColors[item.priority] || priorityColors.medium}`}>
                    {item.priority}
                  </span>
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{item.action}</p>
                    <p className="text-slate-400 text-xs mt-1">{item.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GBP Optimizations */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-3">🏪 GBP Optimizations</h3>
              <ul className="space-y-2">
                {analysis.gbp_optimizations.map((opt, idx) => (
                  <li key={idx} className="text-slate-300 text-xs flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span> {opt}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-3">📝 Content Suggestions</h3>
              <ul className="space-y-2">
                {analysis.content_suggestions.map((sug, idx) => (
                  <li key={idx} className="text-slate-300 text-xs flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">→</span> {sug}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {scans.length === 0 && (
        <div className="text-center py-16 bg-slate-800/30 border border-slate-700/50 rounded-2xl">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-xl font-bold text-white mb-2">No Completed Scans</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Run a GeoGrid scan first, then come back here for AI-powered analysis and recommendations.</p>
        </div>
      )}
    </div>
  );
}
