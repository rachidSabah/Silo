'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { authFetch } from '@/lib/utils';
import { Sparkles, Copy, Check, Loader2, AlertTriangle, FileText, ArrowRight } from 'lucide-react';

type HumanizeLevel = 'light' | 'medium' | 'heavy';
type ContentType = 'blog' | 'article' | 'product' | 'landing' | 'howto';

const LEVELS: { value: HumanizeLevel; label: string; desc: string }[] = [
  { value: 'light', label: 'Light', desc: 'Preserves most structure & phrasing' },
  { value: 'medium', label: 'Medium', desc: 'Balanced rewriting for natural flow' },
  { value: 'heavy', label: 'Heavy', desc: 'Maximum rewriting to sound fully human' },
];

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'blog', label: 'Blog Post' },
  { value: 'article', label: 'Article' },
  { value: 'product', label: 'Product Description' },
  { value: 'landing', label: 'Landing Page' },
  { value: 'howto', label: 'How-To Guide' },
];

interface HumanizeResult {
  humanized: string;
  originalScore: number;
  humanizedScore: number;
  changesCount: number;
  originalWordCount: number;
  humanizedWordCount: number;
}

export default function ContentHumanizer() {
  const { token } = useStore();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<HumanizeResult | null>(null);
  const [level, setLevel] = useState<HumanizeLevel>('medium');
  const [contentType, setContentType] = useState<ContentType>('blog');
  const [preserveKeywords, setPreserveKeywords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  const handleHumanize = async () => {
    if (!input.trim()) { setError('Please paste some content to humanize.'); return; }
    if (!token) { setError('Not authenticated. Please log in.'); return; }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await authFetch('/api/ai/humanize-content', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input, level, contentType, preserveKeywords }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Humanization failed'); return; }
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.humanized) return;
    await navigator.clipboard.writeText(result.humanized);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scoreColor = (score: number) =>
    score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';

  const scoreBg = (score: number) =>
    score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/20 flex-shrink-0">
          <Sparkles size={24} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">AI Content Humanizer</h2>
          <p className="text-slate-400 mt-1">Rewrite AI-generated content to sound natural and bypass AI detection</p>
        </div>
      </div>

      {/* Settings Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">Humanization Level</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as HumanizeLevel)}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label} — {l.desc}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">Content Type</label>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
          >
            {CONTENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={preserveKeywords}
              onChange={(e) => setPreserveKeywords(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-slate-300">Preserve SEO Keywords</span>
          </label>
        </div>
      </div>

      {/* Input / Output Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-300">AI-Generated Content</span>
            </div>
            <span className="text-xs text-slate-500">{wordCount(input)} words</span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your AI-generated content here..."
            className="w-full h-64 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none transition-colors"
          />
        </div>

        {/* Output */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-purple-400" />
              <span className="text-sm font-medium text-slate-300">Humanized Content</span>
            </div>
            {result?.humanized && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          <div className="h-64 overflow-y-auto px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 whitespace-pre-wrap">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={24} className="animate-spin text-blue-400" />
                  <p className="text-slate-500 text-xs">Humanizing content...</p>
                </div>
              </div>
            ) : result?.humanized ? (
              result.humanized
            ) : (
              <p className="text-slate-600 italic">Humanized content will appear here...</p>
            )}
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-center">
        <button
          onClick={handleHumanize}
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 transition-all duration-200"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Humanizing...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Humanize Content
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* AI Detection Score Comparison */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <ArrowRight size={16} className="text-blue-400" />
              AI Detection Score
            </h3>
            <div className="grid grid-cols-2 gap-6">
              {/* Before */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">Before (AI Score)</span>
                  <span className={`text-lg font-bold ${scoreColor(result.originalScore)}`}>
                    {result.originalScore}%
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${scoreBg(result.originalScore)}`}
                    style={{ width: `${result.originalScore}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Likely detected as AI</p>
              </div>
              {/* After */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">After (Human Score)</span>
                  <span className={`text-lg font-bold ${scoreColor(100 - result.humanizedScore)}`}>
                    {100 - result.humanizedScore}%
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${100 - result.humanizedScore}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Likely detected as Human</p>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{result.originalWordCount}</p>
              <p className="text-xs text-slate-500 mt-1">Original Words</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{result.humanizedWordCount}</p>
              <p className="text-xs text-slate-500 mt-1">Humanized Words</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{result.changesCount}</p>
              <p className="text-xs text-slate-500 mt-1">Changes Made</p>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">
                {result.originalScore > 0 ? Math.round((1 - result.humanizedScore / result.originalScore) * 100) : 0}%
              </p>
              <p className="text-xs text-slate-500 mt-1">Improvement</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
