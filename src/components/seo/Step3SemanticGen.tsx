'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { v4 as uuidv4 } from 'uuid';
import PageTypeBadge from './PageTypeBadge';
import VisualTree from './VisualTree';
import { Sparkles, ArrowLeft, ArrowRight, Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

// Client-side emergency page extractor — tries to find pages in any AI response structure
function clientSideExtractPages(
  data: unknown,
  silos: Array<{ id: string; name: string; keywords: string[] }>,
  projectId: string
): Array<{
  id: string; projectId: string; siloId: string | null; title: string; slug: string;
  metaDescription: string; keywords: string[]; type: 'pillar' | 'cluster' | 'blog' | 'category' | 'landing';
  parentId: string | null; status: 'draft' | 'in_progress' | 'review' | 'published'; content: string; wordCount: number;
}> {
  const pages: Array<{
    id: string; projectId: string; siloId: string | null; title: string; slug: string;
    metaDescription: string; keywords: string[]; type: 'pillar' | 'cluster' | 'blog' | 'category' | 'landing';
    parentId: string | null; status: 'draft' | 'in_progress' | 'review' | 'published'; content: string; wordCount: number;
  }> = [];

  const inferType = (key: string, explicitType?: string): 'pillar' | 'cluster' | 'blog' | 'category' | 'landing' => {
    if (explicitType && ['pillar', 'cluster', 'blog', 'category', 'landing'].includes(explicitType)) return explicitType as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing';
    const lower = key.toLowerCase();
    if (lower.includes('pillar')) return 'pillar';
    if (lower.includes('cluster')) return 'cluster';
    if (lower.includes('blog')) return 'blog';
    return 'blog';
  };

  const makePage = (page: Record<string, unknown>, siloId: string | null, inferredType?: string) => {
    if (!page || typeof page !== 'object' || !page.title) return;
    pages.push({
      id: uuidv4(),
      projectId,
      siloId,
      title: String(page.title),
      slug: String(page.slug || String(page.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')),
      metaDescription: String(page.meta_description || page.metaDescription || page.meta_desc || page.description || ''),
      keywords: Array.isArray(page.keywords) ? page.keywords.map(String) : [],
      type: inferType(String(page.type || ''), inferredType),
      parentId: null,
      status: 'draft',
      content: '',
      wordCount: 0,
    });
  };

  // Recursively search for page-like objects
  function scan(obj: unknown, parentKey: string, depth: number): void {
    if (depth > 6 || !obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item && typeof item === 'object' && !Array.isArray(item) && 'title' in (item as Record<string, unknown>)) {
          // Try to find silo from item's silo_name field
          const siloRef = String((item as Record<string, unknown>).silo_name || (item as Record<string, unknown>).siloName || (item as Record<string, unknown>).silo || '');
          const silo = silos.find(s => s.name === siloRef || s.name.toLowerCase() === siloRef.toLowerCase());
          makePage(item as Record<string, unknown>, silo?.id || null, inferType(parentKey));
        }
      }
      return;
    }

    // It's an object - check if this looks like a silo entry
    const record = obj as Record<string, unknown>;
    for (const [key, val] of Object.entries(record)) {
      if (!val || typeof val !== 'object') continue;

      // Check if key matches a silo name
      const silo = silos.find(s => s.name === key || s.name.toLowerCase() === key.toLowerCase());

      if (Array.isArray(val)) {
        // Array of page objects under a silo-named key
        for (const item of val) {
          if (item && typeof item === 'object' && !Array.isArray(item) && 'title' in (item as Record<string, unknown>)) {
            makePage(item as Record<string, unknown>, silo?.id || null, inferType(key));
          }
        }
      } else if (typeof val === 'object') {
        if ('title' in (val as Record<string, unknown>)) {
          // Single page object
          makePage(val as Record<string, unknown>, silo?.id || null, inferType(key));
        } else {
          // Nested structure - recurse
          scan(val, key, depth + 1);
        }
      }
    }
  }

  scan(data, '', 0);
  return pages;
}

export default function Step3SemanticGen() {
  const { project, silos, pages, setPages, setStep, token } = useStore();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedSilos, setExpandedSilos] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'pages' | 'tree'>('pages');

  useEffect(() => {
    if (!project || silos.length === 0) setStep(2);
  }, [project, silos.length, setStep]);

  if (!project || silos.length === 0) return null;

  const handleGeneratePages = async () => {
    setGenerating(true);
    setError('');
    try {
      const siloData = silos.map((s) => ({
        id: s.id,
        name: s.name,
        keywords: s.keywords || [],
      }));

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/generate-pages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          silos: siloData,
          niche: project.niche,
          language: project.language,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate pages');
      }
      const data = await res.json();

      // Debug: log the API response structure
      console.log('[Step3] API response keys:', Object.keys(data), 'type pagesBySilo:', typeof data.pagesBySilo, Array.isArray(data.pagesBySilo));
      if (data.pagesBySilo) {
        console.log('[Step3] pagesBySilo keys:', Object.keys(data.pagesBySilo));
        for (const [k, v] of Object.entries(data.pagesBySilo)) {
          console.log('[Step3]  silo:', k, 'pages:', Array.isArray(v) ? v.length : typeof v);
        }
      }

      // Helper to extract a page object from various field name conventions
      const extractPage = (page: Record<string, unknown>, siloId: string | null, inferredType?: string) => {
        if (!page || typeof page !== 'object' || !page.title) return null;
        const pageType = (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(page.type as string)
          ? page.type
          : inferredType || 'blog') as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing';
        return {
          id: uuidv4(),
          projectId: project.id,
          siloId,
          title: String(page.title),
          slug: String(page.slug || String(page.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')),
          metaDescription: String(page.meta_description || page.metaDescription || page.meta_desc || ''),
          keywords: Array.isArray(page.keywords) ? page.keywords.map(String) : [],
          type: pageType,
          parentId: null,
          status: 'draft' as const,
          content: '',
          wordCount: 0,
        };
      };

      // Helper to infer page type from key name
      const inferType = (key: string): string => {
        const lower = key.toLowerCase();
        if (lower.includes('pillar')) return 'pillar';
        if (lower.includes('cluster')) return 'cluster';
        if (lower.includes('blog')) return 'blog';
        if (lower.includes('category')) return 'category';
        if (lower.includes('landing')) return 'landing';
        return 'blog';
      };

      // Extract pagesBySilo from multiple possible response formats
      let pagesBySilo: Record<string, unknown> | null = null;
      if (data.pagesBySilo && typeof data.pagesBySilo === 'object' && !Array.isArray(data.pagesBySilo)) {
        pagesBySilo = data.pagesBySilo as Record<string, unknown>;
      } else if (data.pages && typeof data.pages === 'object' && !Array.isArray(data.pages)) {
        pagesBySilo = data.pages as Record<string, unknown>;
      } else if (data.silos && typeof data.silos === 'object' && !Array.isArray(data.silos)) {
        pagesBySilo = data.silos as Record<string, unknown>;
      } else if (typeof data === 'object' && !Array.isArray(data) && !data.pagesBySilo && !data.pages && !data.silos && !data.error) {
        // Raw object with silo-name keys (AI returned directly without wrapper)
        pagesBySilo = data as Record<string, unknown>;
      }

      if (pagesBySilo && Object.keys(pagesBySilo).length > 0) {
        const newPages: Array<ReturnType<typeof extractPage> & {}> = [];
        for (const [siloRef, siloPages] of Object.entries(pagesBySilo)) {
          // Match by both name and ID for robustness
          const silo = silos.find((s) => s.name === siloRef || s.id === siloRef);
          const siloId = silo?.id || null;

          // Case 1: siloPages is an array of page objects
          if (Array.isArray(siloPages) && siloPages.length > 0) {
            for (const page of siloPages) {
              const extracted = extractPage(page as Record<string, unknown>, siloId);
              if (extracted) newPages.push(extracted);
            }
            continue;
          }

          // Case 2: siloPages is a nested object like {pillar: {...}, clusters: [...], blogs: [...]}
          if (siloPages && typeof siloPages === 'object' && !Array.isArray(siloPages)) {
            const nested = siloPages as Record<string, unknown>;

            // Check for a "pages" key inside
            if (Array.isArray(nested.pages) && nested.pages.length > 0) {
              for (const page of nested.pages) {
                const extracted = extractPage(page as Record<string, unknown>, siloId);
                if (extracted) newPages.push(extracted);
              }
              continue;
            }

            // Process each sub-key (pillar, clusters, blogs, etc.)
            for (const [subKey, subVal] of Object.entries(nested)) {
              const inferredType = inferType(subKey);

              // Single page object: {pillar: {title, slug, ...}}
              if (subVal && typeof subVal === 'object' && !Array.isArray(subVal) && (subVal as Record<string, unknown>).title) {
                const extracted = extractPage(subVal as Record<string, unknown>, siloId, inferredType);
                if (extracted) newPages.push(extracted);
              }

              // Array of page objects: {clusters: [{title, ...}, ...]}
              if (Array.isArray(subVal)) {
                for (const page of subVal) {
                  const extracted = extractPage(page as Record<string, unknown>, siloId, inferredType);
                  if (extracted) newPages.push(extracted);
                }
              }
            }
            continue;
          }
        }
        if (newPages.length > 0) {
          setPages(newPages);
        } else {
          console.error('[Step3] pagesBySilo had keys but no valid pages extracted. pagesBySilo:', JSON.stringify(pagesBySilo).slice(0, 500));
          setError('AI generated data but no valid pages could be extracted. Please try again.');
        }
      } else {
        // Check if server sent debug info with raw AI response
        const debugInfo = data._debug as { rawLength?: number; rawPreview?: string; parseError?: string } | undefined;
        console.error('[Step3] No recognizable page data in response. Response keys:', Object.keys(data), 'Debug:', debugInfo);

        // Last-ditch: try to parse the raw AI preview on the client side
        if (debugInfo?.rawPreview) {
          try {
            const rawText = debugInfo.rawPreview;
            // Try to find JSON in the raw text
            const jsonMatch = rawText.indexOf('{');
            if (jsonMatch !== -1) {
              const jsonStr = rawText.slice(jsonMatch);
              const parsed = JSON.parse(jsonStr);
              console.log('[Step3] Client-side raw parse succeeded, trying to extract pages...');
              // Try to extract pages from whatever structure we got
              const extracted = clientSideExtractPages(parsed, silos, project.id);
              if (extracted.length > 0) {
                setPages(extracted);
                return; // Success!
              }
            }
          } catch (e) {
            console.error('[Step3] Client-side raw parse also failed:', e);
          }
        }

        if (debugInfo?.rawPreview) {
          setError(`AI returned unexpected format. Server received ${debugInfo.rawLength} chars. ${debugInfo.parseError || ''}. Please try again.`);
        } else {
          setError('AI returned unexpected format. Please try again. (Response had no recognizable page data)');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate pages. Please try again.');
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
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Semantic Generation</h2>
        <p className="text-sm md:text-base text-slate-400">
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
          <div className="flex flex-wrap gap-3 mb-6">
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

          {/* Generating indicator */}
          {generating && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 size={20} className="animate-spin text-blue-400" />
                <span className="text-blue-300 font-medium text-sm">AI is generating your page structure...</span>
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
                  className="w-full flex items-center justify-between p-3 md:p-4 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    {expandedSilos[silo.id] !== false ? (
                      <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight size={18} className="text-slate-400 flex-shrink-0" />
                    )}
                    <span className="text-white font-medium text-sm md:text-base">{silo.name}</span>
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-400 rounded text-xs">
                      {siloPages.length} pages
                    </span>
                  </div>
                </button>

                {expandedSilos[silo.id] !== false && siloPages.length > 0 && (
                  <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-2">
                    {siloPages.map((page) => (
                      <div
                        key={page.id}
                        className="flex items-center gap-2 md:gap-3 p-2.5 md:p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors"
                      >
                        <PageTypeBadge type={page.type} />
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-xs md:text-sm font-medium truncate">{page.title}</div>
                          <div className="text-slate-500 text-[10px] md:text-xs mt-0.5">
                            /{page.slug}
                          </div>
                        </div>
                        <div className="hidden sm:flex flex-wrap gap-1 max-w-[160px]">
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
                  <div className="px-3 md:px-4 pb-3 md:pb-4 text-slate-500 text-sm italic">
                    No pages generated yet
                  </div>
                )}
              </div>
            ))}

            {unassignedPages.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-3 md:p-4 border-b border-slate-700">
                  <span className="text-white font-medium text-sm md:text-base">Unassigned Pages</span>
                  <span className="ml-2 px-2 py-0.5 bg-slate-700 text-slate-400 rounded text-xs">
                    {unassignedPages.length}
                  </span>
                </div>
                <div className="p-3 md:p-4 space-y-2">
                  {unassignedPages.map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center gap-2 md:gap-3 p-2.5 md:p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                    >
                      <PageTypeBadge type={page.type} />
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs md:text-sm font-medium truncate">{page.title}</div>
                        <div className="text-slate-500 text-[10px] md:text-xs mt-0.5">/{page.slug}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {pages.length === 0 && !generating && (
            <div className="text-center py-12 md:py-16 text-slate-500">
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
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(2)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={() => setStep(4)}
          disabled={pages.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Next: Page Management
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
