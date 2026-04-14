'use client';

import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { authFetch } from '@/lib/utils';
import {
  Globe, Search, Loader2, AlertTriangle, Layers, Link2,
  FileText, ChevronDown, ChevronUp, ExternalLink, CheckCircle2,
  ArrowRight, Zap, BarChart3,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface WPSiloPage {
  title: string;
  url: string;
  id: number;
}

interface ProposedSilo {
  name: string;
  pillar: WPSiloPage;
  clusters: WPSiloPage[];
  unassigned: WPSiloPage[];
}

interface OrphanedContent {
  title: string;
  url: string;
  id: number;
  reason: string;
}

interface InternalLinkAction {
  from_page: WPSiloPage;
  to_page: WPSiloPage;
  anchor_text: string;
  reason: string;
}

interface ContentGap {
  type: 'pillar' | 'cluster' | 'blog';
  suggested_title: string;
  suggested_silo: string;
  target_keyword: string;
  search_intent: string;
  priority: 'high' | 'medium' | 'low';
}

interface AuditData {
  domain: string;
  posts_fetched: number;
  audit: {
    proposed_silos: ProposedSilo[];
    orphaned_content: OrphanedContent[];
    internal_link_plan: InternalLinkAction[];
    content_gaps: ContentGap[];
  };
}

type TabId = 'restructuring' | 'missing-links' | 'content-gaps';

// ── Component ────────────────────────────────────────────────────────────────

export default function WPAuditor() {
  const { token } = useStore();

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AuditData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('restructuring');
  const [expandedSilo, setExpandedSilo] = useState<number | null>(null);
  const [checkedLinks, setCheckedLinks] = useState<Set<number>>(new Set());

  // ── Run Audit ────────────────────────────────────────────────────────────

  const handleAudit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Please enter a WordPress site URL.');
      return;
    }

    // Auto-add https:// if missing
    const normalizedUrl = trimmed.match(/^https?:\/\//) ? trimmed : `https://${trimmed}`;

    setLoading(true);
    setError(null);
    setData(null);
    setCheckedLinks(new Set());

    try {
      // Client-side 90s timeout — Cloudflare kills edge functions at 100s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);

      const res = await authFetch('/api/audit-wordpress', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_url: normalizedUrl }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error || `Server error (${res.status})`;
        throw new Error(msg);
      }

      const result = await res.json();
      setData(result);
      setActiveTab('restructuring');
      setExpandedSilo(0);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out (90s). The site may be too slow or have too many posts. Try a faster WordPress site or one with fewer posts.');
      } else {
        setError(err instanceof Error ? err.message : 'Audit failed');
      }
    } finally {
      setLoading(false);
    }
  }, [url, token]);

  // ── Toggle link checkbox ─────────────────────────────────────────────────

  const toggleLink = useCallback((idx: number) => {
    setCheckedLinks(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // ── Summary Stats ────────────────────────────────────────────────────────

  const summaryStats = data ? {
    totalPosts: data.posts_fetched,
    silos: data.audit.proposed_silos.length,
    orphaned: data.audit.orphaned_content.length,
    linksNeeded: data.audit.internal_link_plan.length,
    gaps: data.audit.content_gaps.length,
  } : null;

  // ── Tab Config ───────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; icon: typeof Layers; count: number }[] = [
    { id: 'restructuring', label: 'Proposed Restructuring', icon: Layers, count: data?.audit.proposed_silos.length ?? 0 },
    { id: 'missing-links', label: 'Missing Links', icon: Link2, count: data?.audit.internal_link_plan.length ?? 0 },
    { id: 'content-gaps', label: 'Content Gaps', icon: FileText, count: data?.audit.content_gaps.length ?? 0 },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2.5">
          <Globe size={24} className="text-emerald-400" />
          Live WP Auditor &amp; Cluster Engine
        </h2>
        <p className="text-sm md:text-base text-slate-400">
          Input a live WordPress URL, fetch its content, and get a complete SEO silo rehab plan.
        </p>
      </div>

      {/* ── URL Input ──────────────────────────────────────────────────────── */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-6 space-y-4">
        <label className="text-sm font-medium text-slate-300">WordPress Site URL</label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null); }}
              placeholder="e.g. https://example.com"
              className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-lg
                         text-white text-sm placeholder:text-slate-600
                         focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                         transition-colors"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAudit(); }}
            />
          </div>
          <button
            onClick={handleAudit}
            disabled={loading || !url.trim()}
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm
                       bg-gradient-to-r from-emerald-500 to-emerald-600 text-white
                       hover:from-emerald-600 hover:to-emerald-700
                       shadow-lg shadow-emerald-500/20
                       transition-all duration-200
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? 'Auditing…' : 'Audit Site'}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          The site must have a publicly accessible WordPress REST API ({'/wp-json/wp/v2/posts'}).
        </p>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm font-medium">Audit Failed</p>
            <p className="text-red-300/70 text-xs mt-1">{error}</p>
            {(error.includes('502') || error.includes('timed out') || error.includes('timeout')) && (
              <div className="mt-2 space-y-1">
                <p className="text-red-300/60 text-[11px] font-medium">Suggestions:</p>
                <ul className="text-red-300/50 text-[11px] list-disc list-inside space-y-0.5">
                  <li>Try a faster WordPress site or one with fewer posts</li>
                  <li>Switch to a faster AI model (e.g., gemma-3-12b-it:free or Gemini Flash)</li>
                  <li>Ensure your AI provider API key is valid and has credits</li>
                  <li>Check that the WordPress REST API is publicly accessible</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Loading Skeletons ──────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 animate-pulse">
                <div className="h-3 w-20 bg-slate-700 rounded mb-2" />
                <div className="h-6 w-12 bg-slate-700 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 animate-pulse">
            <div className="h-5 w-48 bg-slate-700 rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-slate-700 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {data && !loading && (
        <div className="space-y-6">
          {/* ── Summary Stats ─────────────────────────────────────────────── */}
          {summaryStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <SummaryCard icon={<Globe size={14} />} label="Domain" value={data.domain} isText />
              <SummaryCard icon={<FileText size={14} />} label="Posts Fetched" value={summaryStats.totalPosts} />
              <SummaryCard icon={<Layers size={14} />} label="Proposed Silos" value={summaryStats.silos} color="blue" />
              <SummaryCard icon={<Link2 size={14} />} label="Links Needed" value={summaryStats.linksNeeded} color="amber" />
              <SummaryCard icon={<Zap size={14} />} label="Content Gaps" value={summaryStats.gaps} color="red" />
            </div>
          )}

          {/* ── Tabs ─────────────────────────────────────────────────────── */}
          <div className="flex gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                  {tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      isActive ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-600/50 text-slate-400'
                    }`}>{tab.count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Tab Content ─────────────────────────────────────────────────── */}
          {activeTab === 'restructuring' && <RestructuringTab silos={data.audit.proposed_silos} expandedSilo={expandedSilo} setExpandedSilo={setExpandedSilo} />}
          {activeTab === 'missing-links' && <MissingLinksTab links={data.audit.internal_link_plan} checkedLinks={checkedLinks} toggleLink={toggleLink} />}
          {activeTab === 'content-gaps' && <ContentGapsTab gaps={data.audit.content_gaps} orphaned={data.audit.orphaned_content} />}
        </div>
      )}

      {/* ── Empty State ────────────────────────────────────────────────────── */}
      {!loading && !data && !error && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 mb-4">
            <Globe size={28} className="text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-400 mb-2">No Audit Yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Enter a WordPress site URL above and click &quot;Audit Site&quot; to fetch its content
            and generate a complete silo rehab plan.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, color, isText }: {
  icon: React.ReactNode; label: string; value: number | string; color?: string; isText?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
    red: 'from-red-500/20 to-red-500/5 border-red-500/20',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20',
  };
  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-400', amber: 'text-amber-400', red: 'text-red-400', emerald: 'text-emerald-400',
  };
  const c = color || '';
  return (
    <div className={`bg-gradient-to-br ${colorMap[c] || 'from-slate-700/30 to-slate-700/10 border-slate-700'} border rounded-xl p-3 md:p-4`}>
      <div className={`flex items-center gap-1.5 mb-1.5 ${iconColorMap[c] || 'text-slate-400'}`}>
        {icon}
        <span className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      {isText ? (
        <p className="text-white text-sm font-bold truncate">{value}</p>
      ) : (
        <p className="text-white text-xl md:text-2xl font-bold">{value}</p>
      )}
    </div>
  );
}

// ── Restructuring Tab ─────────────────────────────────────────────────────────

function RestructuringTab({ silos, expandedSilo, setExpandedSilo }: {
  silos: ProposedSilo[]; expandedSilo: number | null; setExpandedSilo: (v: number | null) => void;
}) {
  if (silos.length === 0) {
    return <EmptyMessage icon={Layers} message="No silos proposed. The site may have too few posts to cluster." />;
  }

  return (
    <div className="space-y-3">
      {silos.map((silo, idx) => {
        const isExpanded = expandedSilo === idx;
        const totalPosts = 1 + silo.clusters.length + silo.unassigned.length;
        return (
          <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {/* Silo Header */}
            <button
              onClick={() => setExpandedSilo(isExpanded ? null : idx)}
              className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Layers size={16} className="text-blue-400" />
                </div>
                <div className="text-left">
                  <h3 className="text-white font-semibold text-sm">{silo.name}</h3>
                  <p className="text-slate-500 text-xs mt-0.5">{totalPosts} posts · 1 pillar · {silo.clusters.length} clusters</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-500/15 text-blue-300 rounded text-[10px] font-medium">
                  {totalPosts} pages
                </span>
                {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="px-4 md:px-5 pb-5 pt-1 border-t border-slate-700/50 space-y-4">
                {/* Pillar */}
                <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-[10px] font-bold">P</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{silo.pillar.title}</p>
                    <a href={silo.pillar.url} target="_blank" rel="noopener noreferrer"
                       className="text-blue-400 text-xs hover:underline flex items-center gap-1 mt-0.5">
                      <ExternalLink size={10} /> {silo.pillar.url}
                    </a>
                  </div>
                </div>

                {/* Clusters */}
                {silo.clusters.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Clusters</p>
                    {silo.clusters.map((cluster, ci) => (
                      <div key={ci} className="flex items-start gap-3 p-2.5 bg-slate-900/80 rounded-lg">
                        <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-purple-300 text-[9px] font-bold">C</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm">{cluster.title}</p>
                          <a href={cluster.url} target="_blank" rel="noopener noreferrer"
                             className="text-slate-500 text-[11px] hover:text-slate-400 flex items-center gap-1 mt-0.5">
                            <ExternalLink size={9} /> {cluster.url}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unassigned */}
                {silo.unassigned.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-500 uppercase tracking-wider font-medium">Unassigned in Silo</p>
                    {silo.unassigned.map((post, ui) => (
                      <div key={ui} className="flex items-start gap-3 p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                        <div className="w-5 h-5 rounded bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-amber-300 text-[9px] font-bold">?</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm">{post.title}</p>
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                             className="text-slate-500 text-[11px] hover:text-slate-400 flex items-center gap-1 mt-0.5">
                            <ExternalLink size={9} /> {post.url}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Missing Links Tab ─────────────────────────────────────────────────────────

function MissingLinksTab({ links, checkedLinks, toggleLink }: {
  links: InternalLinkAction[]; checkedLinks: Set<number>; toggleLink: (idx: number) => void;
}) {
  if (links.length === 0) {
    return <EmptyMessage icon={Link2} message="No internal link actions needed. The site may already be well-connected." />;
  }

  const completedCount = checkedLinks.size;
  const progressPct = Math.round((completedCount / links.length) * 100);

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-300 font-medium">Implementation Progress</span>
          <span className="text-sm text-white font-semibold">{completedCount}/{links.length} links ({progressPct}%)</span>
        </div>
        <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Link Actions */}
      <div className="space-y-2">
        {links.map((link, idx) => {
          const isChecked = checkedLinks.has(idx);
          return (
            <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
              isChecked ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-800 border-slate-700'
            }`}>
              <button
                onClick={() => toggleLink(idx)}
                className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  isChecked ? 'bg-emerald-500 text-white' : 'bg-slate-700 border border-slate-600 hover:border-slate-500'
                }`}
              >
                {isChecked && <CheckCircle2 size={14} />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isChecked ? 'text-slate-400 line-through' : 'text-white'}`}>
                      {link.from_page.title}
                    </p>
                  </div>
                  <ArrowRight size={14} className="text-blue-400 flex-shrink-0 hidden sm:block" />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isChecked ? 'text-slate-400 line-through' : 'text-white'}`}>
                      {link.to_page.title}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-500/15 text-blue-300 rounded text-[10px] font-medium">
                    Anchor: &quot;{link.anchor_text}&quot;
                  </span>
                  <span className="text-[11px] text-slate-500">{link.reason}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Content Gaps Tab ──────────────────────────────────────────────────────────

function ContentGapsTab({ gaps, orphaned }: {
  gaps: ContentGap[]; orphaned: OrphanedContent[];
}) {
  const priorityColors: Record<string, { bg: string; text: string }> = {
    high: { bg: 'bg-red-500/20', text: 'text-red-300' },
    medium: { bg: 'bg-amber-500/20', text: 'text-amber-300' },
    low: { bg: 'bg-slate-600/30', text: 'text-slate-400' },
  };
  const typeIcons: Record<string, string> = { pillar: 'P', cluster: 'C', blog: 'B' };
  const typeColors: Record<string, string> = { pillar: 'bg-blue-500', cluster: 'bg-purple-500/60', blog: 'bg-emerald-500/60' };

  return (
    <div className="space-y-6">
      {/* Content Gaps */}
      {gaps.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-amber-400" />
            <h3 className="text-white font-semibold text-sm">Pages You Need to Write</h3>
          </div>
          {gaps.map((gap, idx) => {
            const pc = priorityColors[gap.priority] || priorityColors.medium;
            return (
              <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${typeColors[gap.type] || 'bg-slate-600'}`}>
                      <span className="text-white text-[10px] font-bold">{typeIcons[gap.type] || '?'}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium">{gap.suggested_title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-slate-500">Silo: {gap.suggested_silo}</span>
                        <span className="text-[11px] text-slate-600">·</span>
                        <span className="text-[11px] text-slate-500">Keyword: {gap.target_keyword}</span>
                        <span className="text-[11px] text-slate-600">·</span>
                        <span className="text-[11px] text-slate-500">{gap.search_intent}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${pc.bg} ${pc.text} flex-shrink-0`}>
                    {gap.priority}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
          <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-2" />
          <p className="text-slate-300 text-sm">No content gaps found. The silos appear to be complete.</p>
        </div>
      )}

      {/* Orphaned Content */}
      {orphaned.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="text-white font-semibold text-sm">Orphaned Content</h3>
            <span className="px-2 py-0.5 bg-amber-500/15 text-amber-300 rounded text-[10px] font-medium">
              {orphaned.length} posts
            </span>
          </div>
          {orphaned.map((post, idx) => (
            <div key={idx} className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">{post.title}</p>
                  <a href={post.url} target="_blank" rel="noopener noreferrer"
                     className="text-slate-500 text-[11px] hover:text-slate-400 flex items-center gap-1 mt-0.5">
                    <ExternalLink size={9} /> {post.url}
                  </a>
                </div>
              </div>
              <p className="text-amber-300/60 text-xs mt-2">{post.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty Message ──────────────────────────────────────────────────────────────

function EmptyMessage({ icon: Icon, message }: { icon: typeof BarChart3; message: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
      <Icon size={24} className="text-slate-600 mx-auto mb-3" />
      <p className="text-slate-400 text-sm">{message}</p>
    </div>
  );
}
