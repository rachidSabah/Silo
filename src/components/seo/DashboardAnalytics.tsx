'use client';

import { useStore } from '@/store/useStore';
import { calculateSEOScore, getScoreColor, getScoreBgColor } from '@/lib/seo-score';
import { calculateSiloHealth, getHealthColor, getHealthBgColor, getHealthDot } from '@/lib/silo-health';
import {
  BarChart3, FileText, Layers, Target, TrendingUp,
  AlertTriangle, CheckCircle2, Clock, Eye,
  Network, Link2, Brain, PenTool, Zap,
} from 'lucide-react';

export default function DashboardAnalytics() {
  const { project, silos, pages, internalLinks, setStep } = useStore();

  // Calculate stats
  const totalPages = pages.length;
  const totalSilos = silos.length;
  const totalKeywords = pages.reduce((sum, p) => sum + p.keywords.length, 0) +
    silos.reduce((sum, s) => sum + s.keywords.length, 0);

  // Status distribution
  const statusCounts = {
    draft: pages.filter(p => p.status === 'draft' || !p.status).length,
    in_progress: pages.filter(p => p.status === 'in_progress').length,
    review: pages.filter(p => p.status === 'review').length,
    published: pages.filter(p => p.status === 'published').length,
  };

  // Type distribution
  const typeCounts = {
    pillar: pages.filter(p => p.type === 'pillar').length,
    cluster: pages.filter(p => p.type === 'cluster').length,
    blog: pages.filter(p => p.type === 'blog').length,
    category: pages.filter(p => p.type === 'category').length,
    landing: pages.filter(p => p.type === 'landing').length,
  };

  // SEO scores
  const seoScores = pages.map(p => calculateSEOScore(p));
  const avgScore = seoScores.length > 0
    ? Math.round(seoScores.reduce((sum, s) => sum + s.score, 0) / seoScores.length)
    : 0;
  const avgGrade = seoScores.length > 0
    ? seoScores.reduce((sum, s) => sum + s.score, 0) / seoScores.length >= 90 ? 'A'
      : seoScores.reduce((sum, s) => sum + s.score, 0) / seoScores.length >= 75 ? 'B'
      : seoScores.reduce((sum, s) => sum + s.score, 0) / seoScores.length >= 60 ? 'C'
      : seoScores.reduce((sum, s) => sum + s.score, 0) / seoScores.length >= 40 ? 'D' : 'F'
    : '-';

  // Pages needing attention (score < 60)
  const needsAttention = seoScores.filter(s => s.score < 60).length;

  // Silo coverage (how many silos have at least one pillar page)
  const silosWithPillar = silos.filter(s =>
    pages.some(p => p.siloId === s.id && p.type === 'pillar')
  ).length;

  // Silo health scores
  const siloHealthResults = silos.map(silo =>
    calculateSiloHealth(silo, pages, internalLinks.map(l => ({
      fromPageId: l.fromPageId,
      toPageId: l.toPageId,
      anchor: l.anchor,
    })))
  );
  const avgSiloHealth = siloHealthResults.length > 0
    ? Math.round(siloHealthResults.reduce((sum, h) => sum + h.score, 0) / siloHealthResults.length)
    : 0;
  const healthySilos = siloHealthResults.filter(h => h.grade === 'healthy').length;
  const warningSilos = siloHealthResults.filter(h => h.grade === 'warning').length;
  const criticalSilos = siloHealthResults.filter(h => h.grade === 'critical').length;
  const totalBleedLinks = siloHealthResults.reduce((sum, h) => sum + h.bleedLinks.length, 0);

  // Completion percentage
  const completionPct = totalPages > 0
    ? Math.round(((statusCounts.published + statusCounts.review) / totalPages) * 100)
    : 0;

  // Content generation stats
  const pagesWithContent = pages.filter(p => p.content && p.content.length > 50).length;
  const totalWords = pages.reduce((sum, p) => sum + (p.wordCount || 0), 0);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <BarChart3 size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No Project Selected</p>
        <p className="text-sm mb-4">Create or load a project to see analytics.</p>
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
        >
          Set Up Project
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Dashboard</h2>
        <p className="text-sm md:text-base text-slate-400">Overview of your SEO architecture for <span className="text-blue-400">{project.name}</span></p>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatCard icon={<Layers size={18} />} label="Silos" value={totalSilos} color="blue" />
        <StatCard icon={<FileText size={18} />} label="Pages" value={totalPages} color="purple" />
        <StatCard icon={<Target size={18} />} label="Keywords" value={totalKeywords} color="amber" />
        <StatCard icon={<TrendingUp size={18} />} label="Avg SEO Score" value={avgScore} suffix="/100" color="emerald" />
      </div>

      {/* SEO Score + Content Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* SEO Score Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-400" />
            SEO Health
          </h3>
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center border ${getScoreBgColor(avgGrade as any)}`}>
              <span className={`text-2xl font-bold ${getScoreColor(avgGrade as any)}`}>{avgGrade}</span>
            </div>
            <div>
              <p className="text-white text-lg font-semibold">{avgScore}/100</p>
              <p className="text-slate-400 text-sm">Average Page Score</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                Well optimized
              </span>
              <span className="text-emerald-400">{seoScores.filter(s => s.score >= 75).length} pages</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-yellow-400" />
                Needs improvement
              </span>
              <span className="text-yellow-400">{seoScores.filter(s => s.score >= 40 && s.score < 75).length} pages</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-400" />
                Critical issues
              </span>
              <span className="text-red-400">{needsAttention} pages</span>
            </div>
          </div>
        </div>

        {/* Content Pipeline */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Clock size={16} className="text-amber-400" />
            Content Pipeline
          </h3>
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-sm">Completion</span>
              <span className="text-white text-sm font-medium">{completionPct}%</span>
            </div>
            <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <PipelineRow label="Draft" count={statusCounts.draft} total={totalPages} color="bg-slate-500" />
            <PipelineRow label="In Progress" count={statusCounts.in_progress} total={totalPages} color="bg-blue-500" />
            <PipelineRow label="In Review" count={statusCounts.review} total={totalPages} color="bg-amber-500" />
            <PipelineRow label="Published" count={statusCounts.published} total={totalPages} color="bg-emerald-500" />
          </div>
        </div>
      </div>

      {/* Silo Architecture Health + Page Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Silo Architecture Health */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Network size={16} className="text-emerald-400" />
            Silo Architecture Health
          </h3>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center border bg-slate-700/50 border-slate-600">
              <span className="text-2xl font-bold text-white">{avgSiloHealth}</span>
            </div>
            <div>
              <p className="text-white text-lg font-semibold">{avgSiloHealth}/100</p>
              <p className="text-slate-400 text-sm">Avg Silo Health</p>
            </div>
          </div>
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Healthy
              </span>
              <span className="text-emerald-400">{healthySilos} silos</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-yellow-400 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Warning
              </span>
              <span className="text-yellow-400">{warningSilos} silos</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-red-400 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Critical
              </span>
              <span className="text-red-400">{criticalSilos} silos</span>
            </div>
            {totalBleedLinks > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-400 flex items-center gap-1.5">
                  <Link2 size={14} /> Bleed Links
                </span>
                <span className="text-red-400">{totalBleedLinks}</span>
              </div>
            )}
          </div>
          <div className="space-y-2 max-h-[160px] overflow-y-auto">
            {siloHealthResults.map(hr => (
              <div key={hr.siloId} className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${getHealthDot(hr.grade)}`} />
                  <span className="text-white text-xs truncate">{hr.siloName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${getHealthColor(hr.grade)}`}>{hr.score}</span>
                  <span className="text-slate-500 text-[10px]">{hr.totalPages}p</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Page Types Distribution */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <FileText size={16} className="text-purple-400" />
            Page Types
          </h3>
          <div className="space-y-3">
            <TypeRow label="Pillar" count={typeCounts.pillar} total={totalPages} color="bg-blue-500" desc="Comprehensive guide pages" />
            <TypeRow label="Cluster" count={typeCounts.cluster} total={totalPages} color="bg-purple-500" desc="In-depth subtopic pages" />
            <TypeRow label="Blog" count={typeCounts.blog} total={totalPages} color="bg-amber-500" desc="Blog post content" />
            <TypeRow label="Category" count={typeCounts.category} total={totalPages} color="bg-emerald-500" desc="Category hub pages" />
            <TypeRow label="Landing" count={typeCounts.landing} total={totalPages} color="bg-rose-500" desc="Conversion-focused pages" />
          </div>

          {/* Silo coverage summary */}
          <div className="mt-4 pt-3 border-t border-slate-700">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-400">Silos with pillar page</span>
              <span className="text-emerald-400 font-medium">{silosWithPillar}/{totalSilos}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Unassigned pages</span>
              <span className="text-yellow-400 font-medium">{pages.filter(p => !p.siloId).length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SEO Tools Quick Access */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5">
        <h3 className="text-white font-semibold mb-3">SEO Tools</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ToolCard
            icon={<Network size={20} />}
            label="Silo Builder"
            desc="Visual architecture with health scoring & mind map"
            color="emerald"
            onClick={() => setStep(7)}
            disabled={!project || silos.length === 0}
          />
          <ToolCard
            icon={<Link2 size={20} />}
            label="Linking Engine"
            desc="AI link suggestions & bleed alerts"
            color="red"
            onClick={() => setStep(8)}
            disabled={!project || pages.length === 0}
          />
          <ToolCard
            icon={<Brain size={20} />}
            label="Keyword Intel"
            desc="Clustering, intent & gap analysis"
            color="purple"
            onClick={() => setStep(9)}
            disabled={!project}
          />
          <ToolCard
            icon={<Zap size={20} />}
            label="Article Writer"
            desc="Silo-aware AI content generation & CMS push"
            color="emerald"
            onClick={() => setStep(11)}
            disabled={!project || pages.length === 0}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5 mt-4">
        <h3 className="text-white font-semibold mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStep(2)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
          >
            <Layers size={14} />
            Manage Silos
          </button>
          <button
            onClick={() => setStep(4)}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-sm hover:bg-purple-500/30 transition-colors"
          >
            <FileText size={14} />
            Manage Pages
          </button>
          <button
            onClick={() => setStep(6)}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-sm hover:bg-amber-500/30 transition-colors"
          >
            <Clock size={14} />
            Content Calendar
          </button>
          <button
            onClick={() => setStep(5)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
          >
            <Eye size={14} />
            Export & Save
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, suffix }: {
  icon: React.ReactNode; label: string; value: number; color: string; suffix?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/20',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20',
  };
  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-3 md:p-4`}>
      <div className={`flex items-center gap-2 mb-2 ${iconColorMap[color]}`}>
        {icon}
        <span className="text-slate-400 text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-white text-xl md:text-2xl font-bold">
        {value}{suffix && <span className="text-sm text-slate-400 font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

function PipelineRow({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 text-sm w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-white text-sm font-medium w-12 text-right flex-shrink-0">{count}</span>
    </div>
  );
}

function TypeRow({ label, count, total, color, desc }: {
  label: string; count: number; total: number; color: string; desc: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-white text-sm">{label}</span>
          <span className="text-slate-500 text-xs hidden sm:inline">- {desc}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">{pct}%</span>
          <span className="text-white text-sm font-medium w-6 text-right">{count}</span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ToolCard({ icon, label, desc, color, onClick, disabled }: {
  icon: React.ReactNode; label: string; desc: string; color: string; onClick: () => void; disabled?: boolean;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string; hover: string }> = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/20', hover: 'hover:bg-emerald-500/20' },
    red: { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/20', hover: 'hover:bg-red-500/20' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-300', border: 'border-purple-500/20', hover: 'hover:bg-purple-500/20' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/20', hover: 'hover:bg-amber-500/20' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-300', border: 'border-blue-500/20', hover: 'hover:bg-blue-500/20' },
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-4 ${c.bg} ${c.border} border rounded-xl text-left transition-all ${c.hover} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <div className={`${c.text} mb-2`}>{icon}</div>
      <div className="text-white text-sm font-medium mb-0.5">{label}</div>
      <div className="text-slate-400 text-[11px]">{desc}</div>
    </button>
  );
}
