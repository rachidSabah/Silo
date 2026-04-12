'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useStore, type ContentGap } from '@/store/useStore';
import { authFetch } from '@/lib/utils';
import {
  GitCompare,
  Plus,
  ArrowRight,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────

const priorityConfig = {
  high: {
    label: 'HIGH',
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/25',
    dot: 'bg-red-400',
  },
  medium: {
    label: 'MEDIUM',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/25',
    dot: 'bg-amber-400',
  },
  low: {
    label: 'LOW',
    bg: 'bg-slate-500/15',
    text: 'text-slate-400',
    border: 'border-slate-500/25',
    dot: 'bg-slate-400',
  },
} as const;

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str.startsWith('http') ? str : `https://${str}`);
    return !!u.hostname && u.hostname.includes('.');
  } catch {
    return false;
  }
}

// ── Component ────────────────────────────────────────────────────────

export default function ContentGapAnalyzer() {
  const { project, silos, pages, token, contentGaps, setContentGaps } = useStore();

  // Local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [competitorInput, setCompetitorInput] = useState('');
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([]);
  const [results, setResults] = useState<ContentGap[] | null>(null);
  const [coverageData, setCoverageData] = useState<{
    yourCoverage: number;
    competitorCoverage: number;
  } | null>(null);

  // Use store gaps as initial results if available
  useEffect(() => {
    if (contentGaps.length > 0 && !results) {
      setResults(contentGaps);
    }
  }, [contentGaps, results]);

  // ── Derived data ─────────────────────────────────────────────────

  const pageTitles = useMemo(
    () => pages.map((p) => p.title),
    [pages],
  );

  const userSilosData = useMemo(
    () => silos.map((s) => ({ name: s.name, keywords: s.keywords })),
    [silos],
  );

  const stats = useMemo(() => {
    if (!results) return null;
    const topicsYouCover = pages.length;
    const gapsFound = results.length;
    const quickWins = results.filter(
      (g) => g.priority === 'high' || g.priority === 'medium',
    ).length;
    return { topicsYouCover, gapsFound, quickWins };
  }, [results, pages]);

  // ── Competitor URL management ────────────────────────────────────

  const addCompetitor = useCallback(() => {
    const raw = competitorInput.trim();
    if (!raw) return;
    if (competitorUrls.length >= 3) return;
    const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
    if (!isValidUrl(normalized)) {
      setError('Please enter a valid domain or URL (e.g. competitor.com)');
      return;
    }
    // Extract hostname for display
    const hostname = new URL(normalized).hostname.replace(/^www\./, '');
    if (competitorUrls.includes(hostname)) {
      setError('This competitor has already been added');
      return;
    }
    setCompetitorUrls((prev) => [...prev, hostname]);
    setCompetitorInput('');
    setError(null);
  }, [competitorInput, competitorUrls]);

  const removeCompetitor = useCallback((url: string) => {
    setCompetitorUrls((prev) => prev.filter((c) => c !== url));
  }, []);

  const handleCompetitorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCompetitor();
      }
    },
    [addCompetitor],
  );

  // ── Analyze gaps ─────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!project || !token) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setCoverageData(null);

    try {
      const body: Record<string, unknown> = {
        userSilos: userSilosData,
        competitorSilos: competitorUrls.length > 0 ? [] : [],
        niche: project.niche,
        competitorUrls,
      };

      const res = await authFetch('/api/ai/content-gap', token, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as Record<string, string>).error || 'Failed to analyze content gaps',
        );
      }

      const data = await res.json();
      const gaps: ContentGap[] = data.gaps || (Array.isArray(data) ? data : []);
      setResults(gaps);
      setContentGaps(gaps);

      // Calculate coverage estimate
      const totalTopics = pages.length + gaps.length;
      const yourPct = totalTopics > 0 ? Math.round((pages.length / totalTopics) * 100) : 0;
      const compPct = 100;
      setCoverageData({ yourCoverage: yourPct, competitorCoverage: compPct });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Content gap analysis failed',
      );
    } finally {
      setLoading(false);
    }
  }, [project, token, userSilosData, competitorUrls, pages.length, setContentGaps]);

  // ── Create page draft ────────────────────────────────────────────

  const handleCreatePage = useCallback(
    (gap: ContentGap) => {
      const matchedSilo = silos.find(
        (s) => s.name.toLowerCase() === gap.suggestedSilo.toLowerCase(),
      );

      const newPage = {
        id: crypto.randomUUID(),
        projectId: project?.id || '',
        siloId: matchedSilo?.id || null,
        title: gap.topic,
        slug: gap.topic
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
        metaDescription: `Cover ${gap.keywords.slice(0, 3).join(', ')} and related topics.`,
        keywords: gap.keywords,
        type: 'cluster' as const,
        parentId: null,
        status: 'draft' as const,
        content: '',
        wordCount: 0,
        targetKeyword: gap.keywords[0] || gap.topic,
        searchIntent: 'Informational',
        suggestedParentKeyword: matchedSilo?.keywords[0] || undefined,
      };

      useStore.getState().addPage(newPage);
    },
    [silos, project],
  );

  // ── Guard ────────────────────────────────────────────────────────

  if (!project) return null;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-2">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2.5">
          <GitCompare size={24} className="text-blue-400" />
          Content Gap Analyzer
        </h2>
        <p className="text-sm md:text-base text-slate-400">
          Find missing topics and uncover content opportunities your competitors are targeting
        </p>
      </div>

      {/* ── Input Section (Two Columns) ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* LEFT — Your Content */}
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <CheckCircle size={15} className="text-emerald-400" />
              Your Content
            </h3>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-md">
              {pages.length} page{pages.length !== 1 ? 's' : ''}
            </span>
          </div>

          {pages.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm">
              <XCircle size={28} className="mx-auto mb-2 opacity-40" />
              No pages yet. Create pages first to compare.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
              {pageTitles.map((title, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-xs font-medium"
                >
                  {title}
                </span>
              ))}
            </div>
          )}

          {silos.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/40">
              <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wider font-medium">
                Silos
              </p>
              <div className="flex flex-wrap gap-1.5">
                {silos.map((s) => (
                  <span
                    key={s.id}
                    className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded text-[11px] font-medium"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Competitor URLs */}
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <Target size={15} className="text-amber-400" />
              Competitor URLs
            </h3>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-md">
              {competitorUrls.length}/3
            </span>
          </div>

          {/* Input row */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={competitorInput}
              onChange={(e) => setCompetitorInput(e.target.value)}
              onKeyDown={handleCompetitorKeyDown}
              placeholder="e.g. competitor.com"
              disabled={competitorUrls.length >= 3}
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors disabled:opacity-40"
            />
            <button
              onClick={addCompetitor}
              disabled={competitorUrls.length >= 3 || !competitorInput.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 text-white rounded-lg text-xs font-medium hover:bg-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          {/* Competitor tags */}
          {competitorUrls.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {competitorUrls.map((url) => (
                <span
                  key={url}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-xs font-medium group"
                >
                  {url}
                  <button
                    onClick={() => removeCompetitor(url)}
                    className="ml-0.5 text-amber-500/60 hover:text-amber-300 transition-colors"
                    aria-label={`Remove ${url}`}
                  >
                    <XCircle size={13} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-xs">
              Add up to 3 competitor domains to compare against your content.
            </p>
          )}
        </div>
      </div>

      {/* ── Error display ───────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-red-400" />
          <div>
            <p className="font-medium text-red-200 mb-0.5">Analysis Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* ── Analyze Button ──────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleAnalyze}
          disabled={loading || !project || pages.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-semibold hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg shadow-blue-500/20 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <GitCompare size={18} />
          )}
          {loading ? 'Analyzing Gaps…' : 'Analyze Content Gaps'}
        </button>

        {!loading && results === null && (
          <span className="text-slate-500 text-xs hidden sm:inline">
            {pages.length} page{pages.length !== 1 ? 's' : ''} &middot;{' '}
            {competitorUrls.length} competitor
            {competitorUrls.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Loading State ───────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          {/* Skeleton summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { color: 'bg-emerald-500/20', w: 'w-20' },
              { color: 'bg-amber-500/20', w: 'w-16' },
              { color: 'bg-blue-500/20', w: 'w-24' },
            ].map((s, i) => (
              <div
                key={i}
                className="bg-slate-900 border border-slate-700/60 rounded-xl p-5"
              >
                <div className={`${s.color} ${s.w} h-8 rounded-md mb-2`} />
                <div className="bg-slate-700/40 h-3 w-28 rounded" />
              </div>
            ))}
          </div>

          {/* Skeleton gap rows */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-blue-400" />
              <span className="text-slate-400 text-sm">
                Comparing your content against competitors…
              </span>
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="bg-slate-700/40 h-4 w-40 rounded" />
                <div className="bg-slate-700/40 h-5 w-16 rounded-md" />
                <div className="flex-1 bg-slate-700/40 h-4 rounded" />
                <div className="bg-slate-700/40 h-8 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────── */}
      {!loading && results && results.length > 0 && (
        <div className="space-y-5">
          {/* Summary row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-4 md:p-5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={16} className="text-emerald-400" />
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                  Topics You Cover
                </span>
              </div>
              <p className="text-2xl md:text-3xl font-bold text-emerald-400">
                {stats?.topicsYouCover ?? 0}
              </p>
            </div>

            <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4 md:p-5">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} className="text-amber-400" />
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                  Gaps Found
                </span>
              </div>
              <p className="text-2xl md:text-3xl font-bold text-amber-400">
                {stats?.gapsFound ?? 0}
              </p>
            </div>

            <div className="bg-slate-900 border border-blue-500/20 rounded-xl p-4 md:p-5">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-blue-400" />
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                  Quick Wins
                </span>
              </div>
              <p className="text-2xl md:text-3xl font-bold text-blue-400">
                {stats?.quickWins ?? 0}
              </p>
            </div>
          </div>

          {/* Opportunity Score / Coverage Chart */}
          {coverageData && (
            <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 md:p-5">
              <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                <TrendingUp size={15} className="text-blue-400" />
                Coverage Comparison
              </h3>

              <div className="space-y-4">
                {/* Your coverage */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-300 text-xs font-medium">
                      Your Coverage
                    </span>
                    <span className="text-emerald-400 text-xs font-bold">
                      {coverageData.yourCoverage}%
                    </span>
                  </div>
                  <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${coverageData.yourCoverage}%` }}
                    />
                  </div>
                </div>

                {/* Competitor coverage */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-300 text-xs font-medium">
                      Competitor Coverage
                    </span>
                    <span className="text-amber-400 text-xs font-bold">
                      {coverageData.competitorCoverage}%
                    </span>
                  </div>
                  <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${coverageData.competitorCoverage}%` }}
                    />
                  </div>
                </div>

                {/* Gap indicator */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/40">
                  <ArrowRight size={14} className="text-slate-500" />
                  <span className="text-slate-400 text-xs">
                    You&apos;re covering{' '}
                    <span className="text-emerald-400 font-semibold">
                      {coverageData.yourCoverage}%
                    </span>{' '}
                    of the topics your competitors target —{' '}
                    <span className="text-amber-400 font-semibold">
                      {100 - coverageData.yourCoverage}% gap
                    </span>{' '}
                    to close.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Gap List */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid md:grid-cols-[1fr_90px_140px_1fr_110px] items-center gap-3 px-5 py-3 bg-slate-800/60 border-b border-slate-700/50 text-[11px] text-slate-500 uppercase tracking-wider font-medium">
              <span>Topic</span>
              <span>Priority</span>
              <span>Suggested Silo</span>
              <span>Keywords</span>
              <span className="text-right">Action</span>
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              <div className="divide-y divide-slate-700/30">
                {results.map((gap, idx) => {
                  const prio = priorityConfig[gap.priority];
                  return (
                    <div
                      key={idx}
                      className={`grid grid-cols-1 md:grid-cols-[1fr_90px_140px_1fr_110px] items-center gap-2 md:gap-3 px-5 py-4 hover:bg-slate-800/30 transition-colors ${
                        gap.priority === 'high'
                          ? 'border-l-2 border-l-red-500/60'
                          : gap.priority === 'medium'
                            ? 'border-l-2 border-l-amber-500/60'
                            : 'border-l-2 border-l-slate-600/40'
                      }`}
                    >
                      {/* Topic */}
                      <div className="font-medium text-white text-sm">
                        {gap.topic}
                      </div>

                      {/* Priority badge */}
                      <div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${prio.bg} ${prio.text} border ${prio.border}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${prio.dot}`}
                          />
                          {prio.label}
                        </span>
                      </div>

                      {/* Suggested silo */}
                      <div className="text-xs">
                        <span className="text-slate-500 hidden md:inline">
                          Assign to →{' '}
                        </span>
                        <span className="text-blue-300 font-medium">
                          {gap.suggestedSilo}
                        </span>
                      </div>

                      {/* Keywords */}
                      <div className="flex flex-wrap gap-1">
                        {gap.keywords.map((kw, ki) => (
                          <span
                            key={ki}
                            className="px-1.5 py-0.5 bg-slate-700/40 text-slate-300 rounded text-[11px] font-medium"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>

                      {/* Create page action */}
                      <div className="md:text-right">
                        <button
                          onClick={() => handleCreatePage(gap)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 border border-blue-500/25 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/25 hover:text-blue-300 transition-colors"
                        >
                          <Plus size={12} />
                          Create Page
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty results (analysis ran but no gaps) ─────────────── */}
      {!loading && results && results.length === 0 && (
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-8 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400 opacity-60" />
          <p className="text-lg text-white font-medium mb-1">
            No Content Gaps Found
          </p>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Your content coverage looks comprehensive! Add competitor URLs or
            expand your niche to discover more opportunities.
          </p>
        </div>
      )}

      {/* ── Initial empty state (no analysis yet) ────────────────── */}
      {!loading && results === null && contentGaps.length === 0 && (
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-8 text-center">
          <GitCompare size={40} className="mx-auto mb-3 text-blue-400 opacity-30" />
          <p className="text-lg text-white font-medium mb-1">
            Ready to Discover Gaps
          </p>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Add competitor URLs above and click &quot;Analyze Content Gaps&quot; to
            uncover missing topics your competitors are targeting.
          </p>
        </div>
      )}
    </div>
  );
}
