'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useStore, type InternalLink } from '@/store/useStore';
import {
  calculateSiloHealth,
  analyzeAnchorTextDistribution,
  detectCannibalization,
  getHealthColor,
  getHealthDot,
} from '@/lib/silo-health';
import PageTypeBadge from './PageTypeBadge';
import {
  Link2, Sparkles, AlertTriangle, AlertCircle, BarChart3,
  ArrowRight, Trash2, RefreshCw, ChevronDown, ChevronRight,
  Shield, Target, TrendingUp,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function InternalLinkingEngine() {
  const {
    project, silos, pages, internalLinks, token,
    setInternalLinks, addInternalLinks, removeInternalLink,
    setStep,
  } = useStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLink, setExpandedLink] = useState<string | null>(null);
  const [showBleedOnly, setShowBleedOnly] = useState(false);
  const [showCannibalization, setShowCannibalization] = useState(true);

  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  // Load existing internal links from DB
  useEffect(() => {
    const loadLinks = async () => {
      if (!project || !token) return;
      try {
        const res = await fetch(`/api/internal-links?project_id=${project.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.links) {
            setInternalLinks(data.links.map((l: Record<string, string>) => ({
              id: l.id,
              projectId: l.project_id,
              fromPageId: l.from_page_id,
              toPageId: l.to_page_id,
              anchor: l.anchor,
            })));
          }
        }
      } catch { /* ignore */ }
    };
    loadLinks();
  }, [project, token, setInternalLinks]);

  // AI Generate internal links
  const handleGenerateLinks = useCallback(async () => {
    if (!project || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/internal-links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pages: pages.map(p => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            type: p.type,
            silo_id: p.siloId,
          })),
          silos: silos.map(s => ({ id: s.id, name: s.name })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate links');
      }

      const data = await res.json();
      const suggestedLinks = data.links || [];

      // Save to DB and store
      if (suggestedLinks.length > 0) {
        const dbRes = await fetch('/api/internal-links', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId: project.id,
            links: suggestedLinks,
          }),
        });

        if (dbRes.ok) {
          const dbData = await dbRes.json();
          if (dbData.links) {
            setInternalLinks(dbData.links.map((l: Record<string, string>) => ({
              id: l.id,
              projectId: l.project_id || project.id,
              fromPageId: l.from_page_id || l.from,
              toPageId: l.to_page_id || l.to,
              anchor: l.anchor,
            })));
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate links');
    } finally {
      setLoading(false);
    }
  }, [project, token, pages, silos, setInternalLinks]);

  // Calculate silo health for bleed detection
  const healthResults = useMemo(() =>
    silos.map(silo => calculateSiloHealth(silo, pages, internalLinks.map(l => ({
      fromPageId: l.fromPageId,
      toPageId: l.toPageId,
      anchor: l.anchor,
    })))),
    [silos, pages, internalLinks]
  );

  // All bleed links
  const allBleedLinks = useMemo(() =>
    healthResults.flatMap(hr => hr.bleedLinks),
    [healthResults]
  );

  // Anchor text distribution
  const anchorDistribution = useMemo(() =>
    analyzeAnchorTextDistribution(internalLinks.map(l => ({
      fromPageId: l.fromPageId,
      toPageId: l.toPageId,
      anchor: l.anchor,
    }))),
    [internalLinks]
  );

  // Cannibalization across all silos
  const allCannibalization = useMemo(() => {
    const results: Array<{ siloName: string; keyword: string; pages: Array<{ id: string; title: string }> }> = [];
    for (const silo of silos) {
      const issues = detectCannibalization(pages, silo.id);
      for (const issue of issues) {
        results.push({ siloName: silo.name, ...issue });
      }
    }
    return results;
  }, [silos, pages]);

  // Filter links
  const displayLinks = useMemo(() => {
    if (showBleedOnly) {
      return internalLinks.filter(link => {
        const fromPage = pages.find(p => p.id === link.fromPageId);
        const toPage = pages.find(p => p.id === link.toPageId);
        return fromPage && toPage && fromPage.siloId !== toPage.siloId;
      });
    }
    return internalLinks;
  }, [internalLinks, pages, showBleedOnly]);

  // Delete a link
  const handleDeleteLink = async (linkId: string) => {
    removeInternalLink(linkId);
    if (token) {
      await fetch(`/api/internal-links?id=${linkId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  };

  // Stats
  const inSiloLinks = internalLinks.filter(link => {
    const fromPage = pages.find(p => p.id === link.fromPageId);
    const toPage = pages.find(p => p.id === link.toPageId);
    return fromPage && toPage && fromPage.siloId === toPage.siloId;
  }).length;
  const crossSiloLinks = internalLinks.length - inSiloLinks;

  if (!project) return null;

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Link2 size={24} className="text-blue-400" />
          Internal Linking Engine
        </h2>
        <p className="text-sm md:text-base text-slate-400">
          AI-powered internal link suggestions, bleed detection, and anchor text optimization.
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-400">{internalLinks.length}</div>
          <div className="text-slate-400 text-xs">Total Links</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-400">{inSiloLinks}</div>
          <div className="text-slate-400 text-xs">In-Silo Links</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-red-400">{crossSiloLinks}</div>
          <div className="text-slate-400 text-xs">Cross-Silo</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-400">{allCannibalization.length}</div>
          <div className="text-slate-400 text-xs">Cannibalization</div>
        </div>
      </div>

      {/* AI Generate Button */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleGenerateLinks}
          disabled={loading || pages.length < 2}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {loading ? 'Generating...' : 'AI Generate Links'}
        </button>

        <button
          onClick={() => setShowBleedOnly(!showBleedOnly)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            showBleedOnly
              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
          }`}
        >
          <AlertTriangle size={14} />
          {showBleedOnly ? 'Showing Bleed Only' : 'Show Bleed Links'}
        </button>

        <button
          onClick={() => setShowCannibalization(!showCannibalization)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            showCannibalization
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
          }`}
        >
          <Target size={14} />
          Cannibalization
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Link List */}
        <div className="lg:col-span-2">
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">
                {showBleedOnly ? 'Silo Bleed Links' : 'Internal Links'} ({displayLinks.length})
              </h3>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {displayLinks.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Link2 size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No internal links yet. Click &quot;AI Generate Links&quot; to start.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {displayLinks.map(link => {
                    const fromPage = pages.find(p => p.id === link.fromPageId);
                    const toPage = pages.find(p => p.id === link.toPageId);
                    const fromSilo = silos.find(s => s.id === fromPage?.siloId);
                    const toSilo = silos.find(s => s.id === toPage?.siloId);
                    const isBleed = fromPage && toPage && fromPage.siloId !== toPage.siloId;
                    const isExpanded = expandedLink === link.id;

                    return (
                      <div key={link.id} className="p-3 hover:bg-slate-800/50 transition-colors">
                        <div
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => setExpandedLink(isExpanded ? null : link.id)}
                        >
                          {isExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                          <div className="flex-1 flex items-center gap-2 min-w-0 text-sm">
                            <span className="text-slate-300 truncate max-w-[140px]">{fromPage?.title || 'Unknown'}</span>
                            <ArrowRight size={12} className={isBleed ? 'text-red-400' : 'text-slate-600'} />
                            <span className="text-blue-300 truncate max-w-[100px]">&quot;{link.anchor}&quot;</span>
                            <ArrowRight size={12} className={isBleed ? 'text-red-400' : 'text-slate-600'} />
                            <span className="text-slate-300 truncate max-w-[140px]">{toPage?.title || 'Unknown'}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isBleed && (
                              <span className="px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded text-[10px] font-medium">
                                BLEED
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteLink(link.id); }}
                              className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-2 ml-6 space-y-1 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">From:</span>
                              <PageTypeBadge type={fromPage?.type || 'blog'} size="sm" />
                              <span className="text-slate-300">{fromPage?.title}</span>
                              <span className="text-slate-500">in</span>
                              <span className={fromSilo ? 'text-blue-300' : 'text-red-400'}>{fromSilo?.name || 'No Silo'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">To:</span>
                              <PageTypeBadge type={toPage?.type || 'blog'} size="sm" />
                              <span className="text-slate-300">{toPage?.title}</span>
                              <span className="text-slate-500">in</span>
                              <span className={toSilo ? 'text-blue-300' : 'text-red-400'}>{toSilo?.name || 'No Silo'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">Anchor:</span>
                              <span className="text-emerald-300">&quot;{link.anchor}&quot;</span>
                            </div>
                            {isBleed && (
                              <div className="mt-1 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-300">
                                <AlertCircle size={12} className="inline mr-1" />
                                This cross-silo link bypasses pillar pages and may leak link equity.
                                Consider linking through the pillar page instead.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Anchor Text + Cannibalization */}
        <div className="space-y-4">
          {/* Anchor Text Distribution */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
              <BarChart3 size={14} className="text-purple-400" />
              Anchor Text Distribution
            </h3>
            {anchorDistribution.length === 0 ? (
              <p className="text-slate-500 text-xs">No links yet.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {anchorDistribution.slice(0, 15).map((item, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300 truncate max-w-[140px]">&quot;{item.anchor}&quot;</span>
                      <span className={`font-medium ${item.percentage > 30 ? 'text-red-400' : item.percentage > 15 ? 'text-yellow-400' : 'text-slate-400'}`}>
                        {item.percentage}% ({item.count})
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.percentage > 30 ? 'bg-red-500' : item.percentage > 15 ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(item.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {anchorDistribution.length > 0 && anchorDistribution[0].percentage > 30 && (
                  <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-300">
                    <AlertTriangle size={12} className="inline mr-1" />
                    Over-optimized! One anchor text is used for over 30% of links. Diversify your anchor text.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Keyword Cannibalization */}
          {showCannibalization && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <Target size={14} className="text-amber-400" />
                Keyword Cannibalization
              </h3>
              {allCannibalization.length === 0 ? (
                <div className="text-center py-4 text-emerald-400 text-xs">
                  <Shield size={20} className="mx-auto mb-1" />
                  No cannibalization detected!
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {allCannibalization.map((issue, i) => (
                    <div key={i} className="p-2 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                      <div className="text-amber-300 text-xs font-medium mb-1">&quot;{issue.keyword}&quot;</div>
                      <div className="text-slate-400 text-[10px] mb-1">Silo: {issue.siloName}</div>
                      <div className="space-y-0.5">
                        {issue.pages.map((p, j) => (
                          <div key={j} className="text-slate-300 text-[11px] flex items-center gap-1.5">
                            <div className="w-1 h-1 rounded-full bg-amber-400" />
                            {p.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(7)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          Back to Silo Builder
        </button>
        <button
          onClick={() => setStep(9)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Keyword Intelligence
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
