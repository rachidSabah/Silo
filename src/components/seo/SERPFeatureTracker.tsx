'use client';

import { useState, useMemo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { authFetch } from '@/lib/utils';
import {
  Search,
  Target,
  Star,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Zap,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface SERPFeatures {
  featured_snippet: boolean;
  people_also_ask: boolean;
  knowledge_panel: boolean;
  image_pack: boolean;
  video_results: boolean;
  local_pack: boolean;
  shopping_results: boolean;
  sitelinks: boolean;
}

interface SERPAnalysis {
  keyword: string;
  features: SERPFeatures;
  difficulty: 'easy' | 'medium' | 'hard';
  strategy: string;
  search_volume?: number;
}

// ── Feature Config ───────────────────────────────────────────────────────────

type FeatureKey = keyof SERPFeatures;

const FEATURE_CONFIG: Record<
  FeatureKey,
  { label: string; colorPresent: string; colorAbsent: string; dotColor: string }
> = {
  featured_snippet: {
    label: 'Featured Snippet',
    colorPresent: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    colorAbsent: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
    dotColor: 'bg-emerald-400',
  },
  people_also_ask: {
    label: 'People Also Ask',
    colorPresent: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    colorAbsent: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
    dotColor: 'bg-amber-400',
  },
  knowledge_panel: {
    label: 'Knowledge Panel',
    colorPresent: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    colorAbsent: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
    dotColor: 'bg-blue-400',
  },
  image_pack: {
    label: 'Image Pack',
    colorPresent: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    colorAbsent: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
    dotColor: 'bg-purple-400',
  },
  video_results: {
    label: 'Video Results',
    colorPresent: 'bg-red-500/20 text-red-300 border-red-500/30',
    colorAbsent: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
    dotColor: 'bg-red-400',
  },
  local_pack: {
    label: 'Local Pack',
    colorPresent: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    colorAbsent: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
    dotColor: 'bg-cyan-400',
  },
  shopping_results: {
    label: 'Shopping Results',
    colorPresent: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    colorAbsent: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
    dotColor: 'bg-pink-400',
  },
  sitelinks: {
    label: 'Sitelinks',
    colorPresent: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    colorAbsent: 'bg-slate-700/50 text-slate-500 border-slate-600/30',
    dotColor: 'bg-indigo-400',
  },
};

const DIFFICULTY_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  easy: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', label: 'Easy' },
  medium: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'Medium' },
  hard: { bg: 'bg-red-500/20', text: 'text-red-300', label: 'Hard' },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function SERPFeatureTracker() {
  const { token, project, pages } = useStore();

  // Local state
  const [keywords, setKeywords] = useState('');
  const [results, setResults] = useState<SERPAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);

  // ── Derived project keywords ────────────────────────────────────────────────

  const projectKeywords = useMemo(() => {
    const kwSet = new Set<string>();
    if (project?.seedKeywords) {
      project.seedKeywords.forEach((kw) => kwSet.add(kw));
    }
    pages.forEach((page) => {
      page.keywords.forEach((kw) => kwSet.add(kw));
      if (page.targetKeyword) kwSet.add(page.targetKeyword);
    });
    return Array.from(kwSet);
  }, [project, pages]);

  // ── Load project keywords into textarea ─────────────────────────────────────

  const handleLoadProjectKeywords = useCallback(() => {
    if (projectKeywords.length > 0) {
      setKeywords(projectKeywords.join('\n'));
    }
  }, [projectKeywords]);

  // ── Parse keywords from textarea ────────────────────────────────────────────

  const parsedKeywords = useMemo(() => {
    return keywords
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }, [keywords]);

  // ── Analyze SERP Features ───────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (parsedKeywords.length === 0) {
      setError('Please enter at least one keyword to analyze.');
      return;
    }

    if (!project) {
      setError('No project selected. Please set up a project first.');
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setExpandedKeyword(null);

    try {
      const res = await authFetch('/api/ai/serp-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: parsedKeywords,
          niche: project.niche,
          domain: project.domain,
        }),
      }, token);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to analyze SERP features');
      }

      const data = await res.json();
      const analyses: SERPAnalysis[] = data.analyses || data.results || (Array.isArray(data) ? data : []);
      setResults(analyses);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'SERP feature analysis failed');
    } finally {
      setLoading(false);
    }
  }, [parsedKeywords, project, token]);

  // ── Summary stats ───────────────────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    const totalKeywords = results.length;
    let totalFeatures = 0;
    let opportunityScore = 0;

    results.forEach((r) => {
      const featureValues = Object.values(r.features);
      const presentCount = featureValues.filter(Boolean).length;
      totalFeatures += presentCount;

      // Score: more features + easier difficulty = higher opportunity
      const diffMultiplier = r.difficulty === 'easy' ? 1.5 : r.difficulty === 'medium' ? 1.0 : 0.6;
      opportunityScore += presentCount * diffMultiplier;
    });

    // Normalize to 0–100
    const maxPossible = totalKeywords * 8 * 1.5;
    const normalizedScore = maxPossible > 0 ? Math.round((opportunityScore / maxPossible) * 100) : 0;

    return {
      totalKeywords,
      totalFeatures,
      opportunityScore: Math.min(normalizedScore, 100),
    };
  }, [results]);

  // ── Toggle expand ───────────────────────────────────────────────────────────

  const toggleExpand = useCallback((keyword: string) => {
    setExpandedKeyword((prev) => (prev === keyword ? null : keyword));
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2.5">
          <Target size={24} className="text-blue-400" />
          SERP Feature Tracker
        </h2>
        <p className="text-sm md:text-base text-slate-400">
          Discover which SERP features appear for your target keywords and get optimization strategies.
        </p>
      </div>

      {/* ── Input Section ──────────────────────────────────────────────────── */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">Target Keywords</label>
          <button
            onClick={handleLoadProjectKeywords}
            disabled={projectKeywords.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                       bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white
                       transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap size={12} />
            Use Project Keywords
            {projectKeywords.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px]">
                {projectKeywords.length}
              </span>
            )}
          </button>
        </div>

        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="Enter target keywords (one per line)..."
          rows={6}
          className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg
                     text-white text-sm placeholder:text-slate-600
                     focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                     resize-none transition-colors"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {parsedKeywords.length} keyword{parsedKeywords.length !== 1 ? 's' : ''} entered
          </span>
          <button
            onClick={handleAnalyze}
            disabled={loading || parsedKeywords.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm
                       bg-gradient-to-r from-blue-500 to-blue-600 text-white
                       hover:from-blue-600 hover:to-blue-700
                       shadow-lg shadow-blue-500/20
                       transition-all duration-200
                       disabled:opacity-40 disabled:cursor-not-allowed
                       disabled:shadow-none"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
            {loading ? 'Analyzing…' : 'Analyze SERP Features'}
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm font-medium">Analysis Failed</p>
            <p className="text-red-300/70 text-xs mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* ── Loading Skeletons ──────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4">
          {/* Summary skeletons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse"
              >
                <div className="h-4 w-24 bg-slate-700 rounded mb-3" />
                <div className="h-8 w-16 bg-slate-700 rounded" />
              </div>
            ))}
          </div>
          {/* Card skeletons */}
          {[1, 2, 3].map((i) => (
            <div
              key={`card-${i}`}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse"
            >
              <div className="h-5 w-40 bg-slate-700 rounded mb-4" />
              <div className="flex flex-wrap gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="h-7 w-28 bg-slate-700 rounded-lg" />
                ))}
              </div>
              <div className="h-3 w-full bg-slate-700 rounded mb-2" />
              <div className="h-3 w-3/4 bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {!loading && results.length > 0 && (
        <div className="space-y-6">
          {/* ── Summary Cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Search size={14} className="text-blue-400" />
                <span className="text-xs text-slate-400 font-medium">Keywords Analyzed</span>
              </div>
              <p className="text-2xl font-bold text-white">{summaryStats.totalKeywords}</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Star size={14} className="text-amber-400" />
                <span className="text-xs text-slate-400 font-medium">Features Found</span>
              </div>
              <p className="text-2xl font-bold text-white">{summaryStats.totalFeatures}</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-emerald-400" />
                <span className="text-xs text-slate-400 font-medium">Opportunity Score</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold text-white">{summaryStats.opportunityScore}</p>
                <span className="text-sm text-slate-500">/ 100</span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-700"
                  style={{ width: `${summaryStats.opportunityScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* ── Per-keyword Cards ─────────────────────────────────────────── */}
          <div className="space-y-4">
            {results.map((analysis, idx) => {
              const isExpanded = expandedKeyword === analysis.keyword;
              const presentFeatures = (Object.entries(analysis.features) as [FeatureKey, boolean][])
                .filter(([, v]) => v);
              const featureCount = presentFeatures.length;
              const diff = DIFFICULTY_BADGE[analysis.difficulty] || DIFFICULTY_BADGE.medium;

              return (
                <div
                  key={idx}
                  className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden
                             transition-all duration-200 hover:border-slate-600"
                >
                  {/* ── Card Header ──────────────────────────────────────── */}
                  <div className="p-4 md:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/15">
                          <Search size={14} className="text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-white font-semibold text-sm md:text-base">
                            {analysis.keyword}
                          </h3>
                          {analysis.search_volume !== undefined && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Est. volume: {analysis.search_volume.toLocaleString()}/mo
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {featureCount}/8 features
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase ${diff.bg} ${diff.text}`}
                        >
                          {diff.label}
                        </span>
                      </div>
                    </div>

                    {/* ── Feature Badges Grid ────────────────────────────── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(Object.entries(analysis.features) as [FeatureKey, boolean][]).map(
                        ([key, present]) => {
                          const cfg = FEATURE_CONFIG[key];
                          return (
                            <div
                              key={key}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                present ? cfg.colorPresent : cfg.colorAbsent
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  present ? cfg.dotColor : 'bg-slate-600'
                                }`}
                              />
                              {cfg.label}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>

                  {/* ── Expandable Strategy Section ─────────────────────── */}
                  {featureCount > 0 && (
                    <>
                      <button
                        onClick={() => toggleExpand(analysis.keyword)}
                        className="w-full flex items-center justify-between px-4 md:px-5 py-3
                                   bg-slate-800/60 border-t border-slate-700/50
                                   text-slate-400 hover:text-white hover:bg-slate-700/30
                                   transition-colors text-sm"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Lightbulb size={14} className="text-amber-400" />
                          Optimization Strategy
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-4 md:px-5 py-4 border-t border-slate-700/30 bg-slate-900/50">
                          {/* Strategy text */}
                          {analysis.strategy && (
                            <div className="mb-4">
                              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                                {analysis.strategy}
                              </p>
                            </div>
                          )}

                          {/* Per-feature tips */}
                          <div className="space-y-2.5">
                            {presentFeatures.map(([key]) => {
                              const cfg = FEATURE_CONFIG[key];
                              return (
                                <div
                                  key={key}
                                  className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-800/80 border border-slate-700/50"
                                >
                                  <span
                                    className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${cfg.dotColor}`}
                                  />
                                  <div>
                                    <p className="text-xs font-semibold text-slate-200 mb-1">
                                      {cfg.label}
                                    </p>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                      {getFeatureTip(key)}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty State ────────────────────────────────────────────────────── */}
      {!loading && results.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 mb-4">
            <Target size={28} className="text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-400 mb-2">No Analysis Yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Enter your target keywords above and click &quot;Analyze SERP Features&quot; to discover
            which SERP features appear and how to optimize your content to win them.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Feature-specific optimization tips ────────────────────────────────────────

function getFeatureTip(feature: FeatureKey): string {
  const tips: Record<FeatureKey, string> = {
    featured_snippet:
      'Structure content with a clear, concise answer at the top. Use "What is...", "How to...", or list formats. Include a direct definition in the first 40–60 words of your section.',
    people_also_ask:
      'Add an FAQ section targeting common questions. Use question-based headings (H2/H3) and provide concise, direct answers underneath each one.',
    knowledge_panel:
      'Implement structured data (Schema.org) for your entity. Ensure your Google Business Profile and Wikipedia/Wikidata entries are complete and accurate.',
    image_pack:
      'Use high-quality images with descriptive alt text, optimized file names, and surrounding contextual content. Add ImageObject schema markup.',
    video_results:
      'Create video content and embed it on the page. Use VideoObject structured data. Ensure your video has a clear title, description, and thumbnail.',
    local_pack:
      'Optimize your Google Business Profile with accurate NAP data. Use local business schema markup and build citations on local directories.',
    shopping_results:
      'Implement Product schema with pricing, availability, and reviews. Submit a product feed to Google Merchant Center.',
    sitelinks:
      'Ensure clear site architecture with logical navigation. Use descriptive anchor text and submit an XML sitemap. Brand searches trigger sitelinks.',
  };
  return tips[feature] || 'Optimize your content structure and markup for this SERP feature.';
}
