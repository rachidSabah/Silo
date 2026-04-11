'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import {
  Globe, Search, Loader2, CheckCircle2, AlertTriangle,
  ArrowRight, ExternalLink, Layers, FileText,
} from 'lucide-react';

export default function CompetitorImporter() {
  const { token, setStep, setSavedProjectId } = useStore();

  const [targetUrl, setTargetUrl] = useState('');
  const [projectName, setProjectName] = useState('');
  const [maxPages, setMaxPages] = useState('50');
  const [language, setLanguage] = useState('en');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    project_id: string;
    silos_created: number;
    pages_created: number;
    domain: string;
    niche: string;
    pages_crawled: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!targetUrl.trim()) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/import-competitor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_url: targetUrl.trim(),
          project_name: projectName.trim() || undefined,
          max_pages: parseInt(maxPages) || 50,
          language,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data);
        setSavedProjectId(data.project_id);
      } else {
        setError(data.error || 'Import failed. Please try again.');
      }
    } catch {
      setError('Network error. The import may take a while for large sites — try with fewer pages.');
    } finally {
      setImporting(false);
    }
  };

  // Success state
  if (result) {
    return (
      <div>
        <div className="mb-6 md:mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Competitor Import Complete</h2>
          <p className="text-sm md:text-base text-slate-400">
            Successfully reverse-engineered <span className="text-blue-400">{result.domain}</span>
          </p>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 size={24} className="text-emerald-400" />
            <span className="text-emerald-300 text-lg font-semibold">Import Successful</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <ResultStat label="Pages Crawled" value={result.pages_crawled} icon={<Globe size={16} />} color="blue" />
            <ResultStat label="Silos Created" value={result.silos_created} icon={<Layers size={16} />} color="purple" />
            <ResultStat label="Pages Created" value={result.pages_created} icon={<FileText size={16} />} color="emerald" />
            <ResultStat label="Niche" value={result.niche ? result.niche.split(' ').slice(0, 2).join(' ') : 'Detected'} icon={<Search size={16} />} color="amber" textValue />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setStep(7)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              <Layers size={14} />
              Open in Visual Silo Builder
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => {
                setResult(null);
                setTargetUrl('');
                setProjectName('');
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-600 transition-colors"
            >
              Import Another Site
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Competitor Importer</h2>
        <p className="text-sm md:text-base text-slate-400">
          Scrape a competitor&apos;s site natively on the Edge and map it into your silo architecture.
          No 3rd party APIs required.
        </p>
      </div>

      {/* Import Form */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-6 mb-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Globe size={16} className="text-blue-400" />
          Target Website
        </h3>

        <div className="space-y-4">
          {/* URL Input */}
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Competitor URL *</label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://competitor.com"
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Project Name */}
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Project Name (optional)</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Auto-generated from domain name"
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Max Pages */}
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Max Pages to Crawl</label>
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
              >
                <option value="10">10 pages (quick scan)</option>
                <option value="25">25 pages</option>
                <option value="50">50 pages (recommended)</option>
                <option value="75">75 pages</option>
                <option value="100">100 pages (deep crawl)</option>
              </select>
            </div>

            {/* Language */}
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Content Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
                <option value="it">Italian</option>
                <option value="nl">Dutch</option>
                <option value="ar">Arabic</option>
                <option value="zh">Chinese</option>
                <option value="ja">Japanese</option>
              </select>
            </div>
          </div>

          {/* Import Button */}
          <button
            onClick={handleImport}
            disabled={importing || !targetUrl.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {importing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Scraping & Analyzing... This may take 30-60 seconds
              </>
            ) : (
              <>
                <Search size={16} />
                Import Competitor Site
              </>
            )}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-red-300 text-sm">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 md:p-5">
        <h3 className="text-white font-semibold mb-3">How It Works</h3>
        <div className="space-y-3">
          <Step number={1} title="Native Edge Scraping" desc="Uses Cloudflare's HTMLRewriter to extract headings, internal links, and metadata — no 3rd party APIs." />
          <Step number={2} title="AI Silo Mapping" desc="Your configured AI provider (OpenAI/Gemini/Claude/DeepSeek) reverse-engineers the semantic Pillar/Cluster structure." />
          <Step number={3} title="Save to D1" desc="The mapped structure is saved as a new project with silos and pages, ready for the Visual Silo Builder." />
        </div>

        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-blue-300 text-xs">
            <strong>Concurrency Safe:</strong> URL crawling runs in batches of 5 concurrent requests.
            AI calls run at max 3 concurrent. No Worker CPU timeouts or 429 errors.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value, icon, color, textValue }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; textValue?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  };
  return (
    <div className="text-center">
      <div className={`${colorMap[color]} mb-1 flex justify-center`}>{icon}</div>
      <div className={`text-lg font-bold ${textValue ? 'text-white text-sm' : 'text-white'}`}>{value}</div>
      <div className="text-slate-400 text-xs">{label}</div>
    </div>
  );
}

function Step({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-blue-400 text-xs font-bold">{number}</span>
      </div>
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-slate-400 text-xs">{desc}</p>
      </div>
    </div>
  );
}
