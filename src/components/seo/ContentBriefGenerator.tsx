'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore, type ContentBrief } from '@/store/useStore';
import { calculateSEOScore, getScoreColor, getScoreBgColor } from '@/lib/seo-score';
import PageTypeBadge from './PageTypeBadge';
import {
  FileText, Sparkles, ArrowRight, RefreshCw, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, Copy, Download, Target, BookOpen,
  Link2, Lightbulb, PenTool,
} from 'lucide-react';

export default function ContentBriefGenerator() {
  const { project, silos, pages, token, contentBrief, setContentBrief, setStep } = useStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showAllPages, setShowAllPages] = useState(false);

  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  // Group pages by silo for selection
  const pagesBySilo = silos.map(silo => ({
    silo,
    pages: pages.filter(p => p.siloId === silo.id),
  }));

  // Unassigned pages
  const unassignedPages = pages.filter(p => !p.siloId);

  // Generate content brief for selected page
  const handleGenerateBrief = useCallback(async (pageId: string) => {
    if (!project || !token) return;
    const page = pages.find(p => p.id === pageId);
    if (!page) return;

    setLoading(true);
    setError(null);
    setSelectedPageId(pageId);
    try {
      const silo = silos.find(s => s.id === page.siloId);
      const siloPages = pages.filter(p => p.siloId === page.siloId && p.id !== page.id);

      const res = await fetch('/api/ai/content-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pageTitle: page.title,
          pageType: page.type,
          siloName: silo?.name || 'General',
          keywords: page.keywords,
          siblingPages: siloPages.map(p => ({ title: p.title, type: p.type })),
          niche: project.niche,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate brief');
      }

      const data = await res.json();
      setContentBrief(data.brief);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Brief generation failed');
    } finally {
      setLoading(false);
    }
  }, [project, token, pages, silos, setContentBrief]);

  // Copy to clipboard
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  // Export brief as text
  const handleExportBrief = () => {
    if (!contentBrief) return;
    const text = `CONTENT BRIEF
=============

Title: ${contentBrief.title}

Target Keywords: ${contentBrief.targetKeywords.join(', ')}

Search Intent: ${contentBrief.searchIntent}

Content Type: ${contentBrief.contentType}

Word Count Target: ${contentBrief.wordCountTarget}

OUTLINE
-------
${contentBrief.outline.map((h, i) => `${i + 1}. ${h}`).join('\n')}

KEY POINTS TO COVER
-------------------
${contentBrief.keyPoints.map((p, i) => `• ${p}`).join('\n')}

INTERNAL LINK TARGETS
---------------------
${contentBrief.internalLinkTargets.map((t, i) => `• ${t}`).join('\n')}

META DESCRIPTION
----------------
${contentBrief.metaDescription}

CALL TO ACTION
--------------
${contentBrief.callToAction}
`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-brief-${contentBrief.title.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!project) return null;

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <PenTool size={24} className="text-emerald-400" />
          Content Brief Generator
        </h2>
        <p className="text-sm md:text-base text-slate-400">
          Generate AI-powered content briefs tailored to each page&apos;s role in the silo structure.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Page Selection */}
        <div className="space-y-4">
          <h3 className="text-white font-semibold text-sm">Select a Page</h3>

          {pagesBySilo.map(({ silo, pages: siloPages }) => (
            <div key={silo.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="p-3 bg-slate-800/50 border-b border-slate-700">
                <span className="text-slate-300 text-xs font-medium">{silo.name}</span>
                <span className="text-slate-500 text-[10px] ml-2">{siloPages.length} pages</span>
              </div>
              <div className="divide-y divide-slate-700/50">
                {siloPages.slice(0, showAllPages ? undefined : 5).map(page => {
                  const seo = calculateSEOScore(page);
                  return (
                    <button
                      key={page.id}
                      onClick={() => handleGenerateBrief(page.id)}
                      disabled={loading}
                      className={`w-full flex items-center gap-2 p-3 text-left hover:bg-slate-700/50 transition-colors disabled:opacity-50 ${
                        selectedPageId === page.id ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''
                      }`}
                    >
                      <PageTypeBadge type={page.type} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-medium truncate">{page.title}</div>
                        <div className="text-slate-500 text-[10px]">/{page.slug}</div>
                      </div>
                      <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getScoreBgColor(seo.grade)}`}>
                        <span className={getScoreColor(seo.grade)}>{seo.grade}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {unassignedPages.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="p-3 bg-slate-800/50 border-b border-slate-700">
                <span className="text-yellow-300 text-xs font-medium">Unassigned Pages</span>
              </div>
              <div className="divide-y divide-slate-700/50">
                {unassignedPages.map(page => (
                  <button
                    key={page.id}
                    onClick={() => handleGenerateBrief(page.id)}
                    disabled={loading}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                  >
                    <PageTypeBadge type={page.type} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-medium truncate">{page.title}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {pages.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              No pages yet. Create pages first.
            </div>
          )}
        </div>

        {/* Right: Brief Display */}
        <div className="lg:col-span-2">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-blue-400" />
              <span className="ml-3 text-slate-400">Generating content brief...</span>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {!loading && !contentBrief && (
            <div className="text-center py-16 text-slate-500">
              <FileText size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg mb-2">No Brief Generated</p>
              <p className="text-sm">Select a page from the left to generate an AI content brief.</p>
            </div>
          )}

          {!loading && contentBrief && (
            <div className="space-y-4">
              {/* Brief Header */}
              <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-white">{contentBrief.title}</h3>
                  <button
                    onClick={handleExportBrief}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600 transition-colors"
                  >
                    <Download size={12} />
                    Export
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {contentBrief.targetKeywords.map((kw, i) => (
                    <span key={i} className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-medium">
                      {kw}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                    <div className="text-blue-300 text-xs font-medium">{contentBrief.searchIntent}</div>
                    <div className="text-slate-500 text-[10px]">Search Intent</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                    <div className="text-purple-300 text-xs font-medium">{contentBrief.contentType}</div>
                    <div className="text-slate-500 text-[10px]">Content Type</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                    <div className="text-emerald-300 text-xs font-medium">{contentBrief.wordCountTarget}</div>
                    <div className="text-slate-500 text-[10px]">Word Count</div>
                  </div>
                </div>
              </div>

              {/* Outline Section */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                    <BookOpen size={14} className="text-blue-400" />
                    Content Outline
                  </h4>
                  <button
                    onClick={() => copyToClipboard(contentBrief.outline.map((h, i) => `H2: ${h}`).join('\n'), 'outline')}
                    className="text-slate-500 hover:text-white transition-colors"
                  >
                    {copiedField === 'outline' ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {contentBrief.outline.map((heading, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-600 text-xs font-mono w-5">{i + 1}.</span>
                      <span className="text-slate-300">{heading}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Points */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Lightbulb size={14} className="text-amber-400" />
                    Key Points to Cover
                  </h4>
                  <button
                    onClick={() => copyToClipboard(contentBrief.keyPoints.join('\n'), 'points')}
                    className="text-slate-500 hover:text-white transition-colors"
                  >
                    {copiedField === 'points' ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="space-y-2">
                  {contentBrief.keyPoints.map((point, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-300">{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Internal Link Targets */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Link2 size={14} className="text-purple-400" />
                    Internal Link Targets
                  </h4>
                </div>
                <div className="space-y-1.5">
                  {contentBrief.internalLinkTargets.map((target, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                      <span className="text-slate-300">{target}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Meta Description */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Target size={14} className="text-emerald-400" />
                    Meta Description
                  </h4>
                  <button
                    onClick={() => copyToClipboard(contentBrief.metaDescription, 'meta')}
                    className="text-slate-500 hover:text-white transition-colors"
                  >
                    {copiedField === 'meta' ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-slate-300 text-sm">{contentBrief.metaDescription}</p>
                <p className="text-slate-500 text-[10px] mt-1">{contentBrief.metaDescription.length} characters</p>
              </div>

              {/* CTA */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <h4 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                  <ArrowRight size={14} className="text-blue-400" />
                  Call to Action
                </h4>
                <p className="text-slate-300 text-sm">{contentBrief.callToAction}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(9)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          Back to Keywords
        </button>
        <button
          onClick={() => setStep(11)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Article Writer
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
