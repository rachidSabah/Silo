'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useStore, type KeywordCluster } from '@/store/useStore';
import PageTypeBadge from './PageTypeBadge';
import {
  Brain, Sparkles, Target, TrendingUp, Search, ArrowRight,
  RefreshCw, ChevronDown, ChevronRight, AlertCircle, Layers,
  BarChart3, PieChart, Plus,
} from 'lucide-react';

type IntentType = 'informational' | 'navigational' | 'transactional' | 'commercial';

const intentConfig: Record<IntentType, { color: string; bgColor: string; label: string; icon: React.ReactNode }> = {
  informational: { color: 'text-blue-400', bgColor: 'bg-blue-500/20', label: 'Informational', icon: <Search size={12} /> },
  navigational: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', label: 'Navigational', icon: <Target size={12} /> },
  transactional: { color: 'text-amber-400', bgColor: 'bg-amber-500/20', label: 'Transactional', icon: <TrendingUp size={12} /> },
  commercial: { color: 'text-purple-400', bgColor: 'bg-purple-500/20', label: 'Commercial', icon: <BarChart3 size={12} /> },
};

interface IntentMapItem {
  keyword: string;
  intent: IntentType;
  funnelStage: string;
}

interface ContentGapItem {
  topic: string;
  keywords: string[];
  priority: 'high' | 'medium' | 'low';
  suggestedSilo: string;
}

export default function KeywordIntelligence() {
  const { project, silos, pages, token, keywordClusters, setKeywordClusters, setStep } = useStore();

  const [activeTab, setActiveTab] = useState<'clusters' | 'intent' | 'gaps'>('clusters');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [intentMap, setIntentMap] = useState<IntentMapItem[]>([]);
  const [contentGaps, setContentGaps] = useState<ContentGapItem[]>([]);
  const [competitorSilos, setCompetitorSilos] = useState('');
  const [showGapInput, setShowGapInput] = useState(false);

  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  // All keywords across project
  const allKeywords = useMemo(() => {
    const kwSet = new Set<string>();
    for (const silo of silos) {
      for (const kw of silo.keywords) kwSet.add(kw);
    }
    for (const page of pages) {
      for (const kw of page.keywords) kwSet.add(kw);
    }
    return Array.from(kwSet);
  }, [silos, pages]);

  // AI Group Keywords
  const handleGroupKeywords = useCallback(async () => {
    if (!project || !token || allKeywords.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/keyword-cluster', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ keywords: allKeywords, niche: project.niche }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to cluster keywords');
      }
      const data = await res.json();
      setKeywordClusters(data.clusters || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Keyword clustering failed');
    } finally {
      setLoading(false);
    }
  }, [project, token, allKeywords, setKeywordClusters]);

  // AI Map Search Intent
  const handleMapIntent = useCallback(async () => {
    if (!project || !token || allKeywords.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/search-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ keywords: allKeywords }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to map intent');
      }
      const data = await res.json();
      setIntentMap(data.intents || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Intent mapping failed');
    } finally {
      setLoading(false);
    }
  }, [project, token, allKeywords]);

  // AI Content Gap Analysis
  const handleAnalyzeGaps = useCallback(async () => {
    if (!project || !token || !competitorSilos.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Parse competitor silos (user enters as "SiloName: kw1, kw2" per line)
      const compSilos = competitorSilos.trim().split('\n').map(line => {
        const [name, kws] = line.split(':');
        return {
          name: (name || '').trim(),
          keywords: (kws || '').split(',').map(k => k.trim()).filter(Boolean),
        };
      }).filter(s => s.name && s.keywords.length > 0);

      if (compSilos.length === 0) {
        throw new Error('Please enter competitor silos in the format: SiloName: keyword1, keyword2');
      }

      const res = await fetch('/api/ai/content-gap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userSilos: silos.map(s => ({ name: s.name, keywords: s.keywords })),
          competitorSilos: compSilos,
          niche: project.niche,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to analyze gaps');
      }

      const data = await res.json();
      setContentGaps(data.gaps || []);
      const { setContentGaps: storeSetGaps } = useStore.getState();
      storeSetGaps(data.gaps || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gap analysis failed');
    } finally {
      setLoading(false);
    }
  }, [project, token, silos, competitorSilos]);

  // Intent distribution for chart
  const intentDistribution = useMemo(() => {
    const dist: Record<string, number> = { informational: 0, navigational: 0, transactional: 0, commercial: 0 };
    for (const item of intentMap) {
      dist[item.intent] = (dist[item.intent] || 0) + 1;
    }
    return dist;
  }, [intentMap]);

  if (!project) return null;

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Brain size={24} className="text-purple-400" />
          Keyword Intelligence
        </h2>
        <p className="text-sm md:text-base text-slate-400">
          AI-powered keyword clustering, search intent mapping, and content gap analysis.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 mb-6">
        {[
          { key: 'clusters', label: 'Keyword Clusters', icon: <Layers size={14} /> },
          { key: 'intent', label: 'Search Intent', icon: <Target size={14} /> },
          { key: 'gaps', label: 'Content Gaps', icon: <TrendingUp size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as 'clusters' | 'intent' | 'gaps')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Keyword Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-purple-400">{allKeywords.length}</div>
          <div className="text-slate-400 text-xs">Total Keywords</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-400">{keywordClusters.length}</div>
          <div className="text-slate-400 text-xs">Clusters</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-400">{contentGaps.length}</div>
          <div className="text-slate-400 text-xs">Content Gaps</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* === Keyword Clusters Tab === */}
      {activeTab === 'clusters' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleGroupKeywords}
              disabled={loading || allKeywords.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors text-sm disabled:opacity-50"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {keywordClusters.length > 0 ? 'Re-cluster Keywords' : 'AI Cluster Keywords'}
            </button>
            <span className="text-slate-500 text-xs">{allKeywords.length} keywords will be grouped</span>
          </div>

          {keywordClusters.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Layers size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg mb-2">No Clusters Yet</p>
              <p className="text-sm">Click &quot;AI Cluster Keywords&quot; to automatically group your keywords by topic similarity.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keywordClusters.map((cluster, i) => {
                const isExpanded = expandedCluster === cluster.name;
                const config = intentConfig[cluster.intent] || intentConfig.informational;
                return (
                  <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/50"
                      onClick={() => setExpandedCluster(isExpanded ? null : cluster.name)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
                        <h4 className="text-white font-medium text-sm">{cluster.name}</h4>
                        <span className="text-slate-500 text-xs">{cluster.keywords.length} keywords</span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${config.bgColor}`}>
                        {config.icon}
                        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4">
                        <div className="flex flex-wrap gap-1.5">
                          {cluster.keywords.map((kw, j) => (
                            <span key={j} className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === Search Intent Tab === */}
      {activeTab === 'intent' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleMapIntent}
              disabled={loading || allKeywords.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors text-sm disabled:opacity-50"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {intentMap.length > 0 ? 'Re-map Intent' : 'AI Map Search Intent'}
            </button>
          </div>

          {/* Intent Distribution Chart */}
          {intentMap.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <PieChart size={14} className="text-blue-400" />
                Intent Distribution
              </h3>
              <div className="space-y-2">
                {Object.entries(intentDistribution).map(([intent, count]) => {
                  const config = intentConfig[intent as IntentType];
                  const pct = intentMap.length > 0 ? Math.round((count / intentMap.length) * 100) : 0;
                  return (
                    <div key={intent}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-1.5">
                          {config.icon}
                          <span className={config.color}>{config.label}</span>
                        </div>
                        <span className="text-slate-400">{pct}% ({count})</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full ${config.bgColor.replace('/20', '')} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intent Map Table */}
          {intentMap.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Target size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg mb-2">No Intent Mapping Yet</p>
              <p className="text-sm">Click &quot;AI Map Search Intent&quot; to classify your keywords by search intent.</p>
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Keyword</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Intent</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">Funnel Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {intentMap.map((item, i) => {
                      const config = intentConfig[item.intent];
                      return (
                        <tr key={i} className="hover:bg-slate-800/50">
                          <td className="px-4 py-2 text-sm text-white">{item.keyword}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color}`}>
                              {config.icon} {config.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-slate-400 capitalize">{item.funnelStage}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === Content Gaps Tab === */}
      {activeTab === 'gaps' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setShowGapInput(!showGapInput)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition-colors text-sm"
            >
              <Plus size={14} />
              Enter Competitor Data
            </button>
          </div>

          {showGapInput && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <h3 className="text-white font-semibold text-sm mb-2">Competitor Silo Structure</h3>
              <p className="text-slate-400 text-xs mb-3">
                Enter your competitor&apos;s silos in the format: <code className="text-blue-300">SiloName: keyword1, keyword2, keyword3</code> (one per line)
              </p>
              <textarea
                value={competitorSilos}
                onChange={(e) => setCompetitorSilos(e.target.value)}
                placeholder={"Dog Training: obedience training, puppy training, leash training\nDog Food: grain free dog food, puppy nutrition, raw diet\nDog Health: dog vaccines, flea treatment, joint supplements"}
                rows={6}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none font-mono"
              />
              <button
                onClick={handleAnalyzeGaps}
                disabled={loading || !competitorSilos.trim()}
                className="mt-3 flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors text-sm disabled:opacity-50"
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Analyze Content Gaps
              </button>
            </div>
          )}

          {contentGaps.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg mb-2">No Gap Analysis Yet</p>
              <p className="text-sm">Enter your competitor&apos;s silo structure to identify missing content opportunities.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contentGaps.map((gap, i) => (
                <div key={i} className={`p-4 rounded-xl border ${
                  gap.priority === 'high' ? 'bg-red-500/5 border-red-500/20' :
                  gap.priority === 'medium' ? 'bg-yellow-500/5 border-yellow-500/20' :
                  'bg-slate-800 border-slate-700'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-white font-medium text-sm">{gap.topic}</h4>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      gap.priority === 'high' ? 'bg-red-500/20 text-red-300' :
                      gap.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {gap.priority} priority
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {gap.keywords.map((kw, j) => (
                      <span key={j} className="px-1.5 py-0.5 bg-slate-700/50 text-slate-300 rounded text-[11px]">
                        {kw}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-400">
                    Suggested silo: <span className="text-blue-300">{gap.suggestedSilo}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(8)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          Back to Linking
        </button>
        <button
          onClick={() => setStep(10)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Content Briefs
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
