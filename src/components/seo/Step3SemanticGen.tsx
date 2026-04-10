'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { v4 as uuidv4 } from 'uuid';
import PageTypeBadge from './PageTypeBadge';
import VisualTree from './VisualTree';
import { Sparkles, ArrowLeft, ArrowRight, Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

export default function Step3SemanticGen() {
  const { project, silos, pages, setPages, setStep } = useStore();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedSilos, setExpandedSilos] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'pages' | 'tree'>('pages');

  if (!project || silos.length === 0) {
    setStep(2);
    return null;
  }

  const handleGeneratePages = async () => {
    setGenerating(true);
    setError('');
    try {
      const siloData = silos.map((s) => ({
        name: s.name,
        keywords: s.keywords || [],
      }));

      const res = await fetch('/api/ai/generate-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          silos: siloData,
          niche: project.niche,
          language: project.language,
        }),
      });

      const data = await res.json();

      if (data.pagesBySilo) {
        const newPages = [];
        for (const [siloName, siloPages] of Object.entries(data.pagesBySilo)) {
          const silo = silos.find((s) => s.name === siloName);
          const pageList = siloPages as Array<{
            title: string;
            slug: string;
            meta_description: string;
            keywords: string[];
            type: string;
          }>;

          for (const page of pageList) {
            newPages.push({
              id: uuidv4(),
              projectId: project.id,
              siloId: silo?.id || null,
              title: page.title,
              slug: page.slug || page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              metaDescription: page.meta_description || '',
              keywords: page.keywords || [],
              type: (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(page.type)
                ? page.type
                : 'blog') as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing',
              parentId: null,
            });
          }
        }
        setPages(newPages);
      } else {
        setError('AI returned unexpected format. Please try again.');
      }
    } catch (err) {
      setError('Failed to generate pages. Please try again.');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const toggleSilo = (siloId: string) => {
    setExpandedSilos((prev) => ({ ...prev, [siloId]: !prev[siloId] }));
  };

  const groupedPages = silos.map((silo) => ({
    silo,
    pages: pages.filter((p) => p.siloId === silo.id),
  }));

  const unassignedPages = pages.filter((p) => !p.siloId);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Semantic Generation</h2>
        <p className="text-slate-400">
          Generate pillar, cluster, and blog pages for each silo using AI.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('pages')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'pages'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Pages
        </button>
        <button
          onClick={() => setActiveTab('tree')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'tree'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Tree View
        </button>
      </div>

      {activeTab === 'pages' ? (
        <>
          {/* Action buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={handleGeneratePages}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating Pages...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Pages with AI
                </>
              )}
            </button>
            {pages.length > 0 && (
              <button
                onClick={handleGeneratePages}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                <RefreshCw size={16} />
                Regenerate
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Progress indicator */}
          {generating && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 size={20} className="animate-spin text-blue-400" />
                <span className="text-blue-300 font-medium">AI is generating your page structure...</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}

          {/* Grouped pages by silo */}
          <div className="space-y-4">
            {groupedPages.map(({ silo, pages: siloPages }) => (
              <div
                key={silo.id}
                className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => toggleSilo(silo.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedSilos[silo.id] !== false ? (
                      <ChevronDown size={18} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={18} className="text-slate-400" />
                    )}
                    <span className="text-white font-medium">{silo.name}</span>
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-400 rounded text-xs">
                      {siloPages.length} pages
                    </span>
                  </div>
                </button>

                {expandedSilos[silo.id] !== false && siloPages.length > 0 && (
                  <div className="px-4 pb-4 space-y-2">
                    {siloPages.map((page) => (
                      <div
                        key={page.id}
                        className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors"
                      >
                        <PageTypeBadge type={page.type} />
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium truncate">{page.title}</div>
                          <div className="text-slate-500 text-xs mt-0.5">
                            /{page.slug}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {page.keywords.slice(0, 3).map((kw, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded text-[10px]"
                            >
                              {kw}
                            </span>
                          ))}
                          {page.keywords.length > 3 && (
                            <span className="text-slate-600 text-[10px]">+{page.keywords.length - 3}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {expandedSilos[silo.id] !== false && siloPages.length === 0 && (
                  <div className="px-4 pb-4 text-slate-500 text-sm italic">
                    No pages generated yet
                  </div>
                )}
              </div>
            ))}

            {unassignedPages.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                  <span className="text-white font-medium">Unassigned Pages</span>
                  <span className="ml-2 px-2 py-0.5 bg-slate-700 text-slate-400 rounded text-xs">
                    {unassignedPages.length}
                  </span>
                </div>
                <div className="p-4 space-y-2">
                  {unassignedPages.map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                    >
                      <PageTypeBadge type={page.type} />
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">{page.title}</div>
                        <div className="text-slate-500 text-xs mt-0.5">/{page.slug}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {pages.length === 0 && !generating && (
            <div className="text-center py-16 text-slate-500">
              <Sparkles size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No pages generated yet</p>
              <p className="text-sm">Click &quot;Generate Pages with AI&quot; to create semantic page structures.</p>
            </div>
          )}
        </>
      ) : (
        <VisualTree />
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-8 mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(2)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={() => setStep(4)}
          disabled={pages.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
        >
          Next: Page Management
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
