'use client';

import { Page } from '@/store/useStore';
import { calculateSEOScore, getScoreColor, getScoreBgColor } from '@/lib/seo-score';
import { CheckCircle2, XCircle, AlertTriangle, Lightbulb } from 'lucide-react';

interface SEOScorePanelProps {
  page: Page;
  compact?: boolean;
}

export default function SEOScorePanel({ page, compact = false }: SEOScorePanelProps) {
  const result = calculateSEOScore(page);

  if (compact) {
    return (
      <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getScoreBgColor(result.grade)}`}>
        <span className={getScoreColor(result.grade)}>{result.grade}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Score display */}
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center border ${getScoreBgColor(result.grade)}`}>
          <span className={`text-lg font-bold ${getScoreColor(result.grade)}`}>{result.score}</span>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold ${getScoreColor(result.grade)}`}>Grade {result.grade}</span>
            <span className="text-slate-500 text-xs">/100</span>
          </div>
          <div className="h-1.5 w-24 bg-slate-700 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                result.grade === 'A' ? 'bg-emerald-500' :
                result.grade === 'B' ? 'bg-green-500' :
                result.grade === 'C' ? 'bg-yellow-500' :
                result.grade === 'D' ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${result.score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Checks */}
      <div className="space-y-1.5">
        <CheckItem label="Has title" passed={result.checks.hasTitle} />
        <CheckItem label="Title under 60 chars" passed={result.checks.titleLength} />
        <CheckItem label="Has URL slug" passed={result.checks.hasSlug} />
        <CheckItem label="Slug format correct" passed={result.checks.slugFormat} />
        <CheckItem label="Has meta description" passed={result.checks.hasMetaDescription} />
        <CheckItem label="Meta desc 120-160 chars" passed={result.checks.metaDescLength} />
        <CheckItem label="Has keywords" passed={result.checks.hasKeywords} />
        <CheckItem label="3-7 keywords" passed={result.checks.keywordCount} />
        <CheckItem label="Assigned to silo" passed={result.checks.hasSilo} />
        <CheckItem label="Has page type" passed={result.checks.hasType} />
      </div>

      {/* Suggestions */}
      {result.suggestions.length > 0 && (
        <div className="pt-2 border-t border-slate-700/50">
          <p className="text-slate-400 text-xs font-medium mb-1.5 flex items-center gap-1">
            <Lightbulb size={12} className="text-amber-400" />
            Suggestions
          </p>
          <ul className="space-y-1">
            {result.suggestions.map((s, i) => (
              <li key={i} className="text-slate-400 text-xs flex items-start gap-1.5">
                <AlertTriangle size={10} className="text-amber-500 mt-0.5 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CheckItem({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {passed ? (
        <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
      ) : (
        <XCircle size={12} className="text-red-400/50 flex-shrink-0" />
      )}
      <span className={passed ? 'text-slate-300' : 'text-slate-500'}>{label}</span>
    </div>
  );
}
