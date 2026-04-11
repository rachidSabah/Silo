'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useStore, type Page, type GeneratedArticle, type CMSConfig } from '@/store/useStore';
import PageTypeBadge from './PageTypeBadge';
import { sanitizeHTML } from '@/lib/utils';
import {
  FileText, Sparkles, ArrowRight, RefreshCw, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, Copy, Download, ExternalLink,
  PenTool, Zap, Send, Globe, Key, Trash2, Plus, Eye, Edit3,
  BookOpen, Link2, Clock, Layers,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function ArticleGenerator() {
  const {
    project, silos, pages, internalLinks, token,
    generatedArticles, addGeneratedArticle, setGeneratedArticles,
    bulkGeneratingProgress, setBulkGeneratingProgress,
    cmsConfigs, setCMSConfigs, addCMSConfig, removeCMSConfig,
    updatePage, setStep,
  } = useStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'articles' | 'cms'>('generate');
  const [brandVoice, setBrandVoice] = useState('professional yet approachable');
  const [viewingArticle, setViewingArticle] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string | null>(null);

  // CMS form state
  const [cmsForm, setCmsForm] = useState({
    type: 'wordpress' as 'wordpress' | 'webhook' | 'headless',
    name: '',
    url: '',
    apiKey: '',
    username: '',
    password: '',
  });
  const [cmsPushing, setCmsPushing] = useState<string | null>(null);
  const [cmsPushResult, setCmsPushResult] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  // Group pages by silo
  const pagesBySilo = useMemo(() =>
    silos.map(silo => ({
      silo,
      pages: pages.filter(p => p.siloId === silo.id),
    })),
    [silos, pages]
  );

  // Get article for a page
  const getArticleForPage = (pageId: string): GeneratedArticle | undefined =>
    generatedArticles.find(a => a.pageId === pageId);

  // Check if page has content saved
  const pageHasContent = (pageId: string): boolean => {
    const page = pages.find(p => p.id === pageId);
    return !!(page?.content && page.content.length > 50);
  };

  // Generate single article with silo context
  const handleGenerateArticle = useCallback(async (pageId: string) => {
    if (!project || !token) return;
    const page = pages.find(p => p.id === pageId);
    if (!page) return;

    setLoading(true);
    setError(null);
    setSelectedPageId(pageId);
    try {
      const silo = silos.find(s => s.id === page.siloId);
      const siloPages = pages.filter(p => p.siloId === page.siloId);
      const pillarPage = siloPages.find(p => p.type === 'pillar');
      const siblingPages = siloPages
        .filter(p => p.id !== page.id)
        .map(p => ({ title: p.title, slug: p.slug, type: p.type, keywords: p.keywords }));

      // Build strategic internal links
      const internalLinksList: Array<{ anchor: string; targetTitle: string; targetSlug: string }> = [];
      if (pillarPage && page.id !== pillarPage.id) {
        internalLinksList.push({
          anchor: pillarPage.keywords[0] || pillarPage.title,
          targetTitle: pillarPage.title,
          targetSlug: pillarPage.slug,
        });
      }
      const otherSiblings = siloPages.filter(p => p.id !== page.id && p.type !== 'pillar').slice(0, 3);
      for (const sibling of otherSiblings) {
        internalLinksList.push({
          anchor: sibling.keywords[0] || sibling.title,
          targetTitle: sibling.title,
          targetSlug: sibling.slug,
        });
      }

      const res = await fetch('/api/ai/generate-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pageTitle: page.title,
          pageType: page.type,
          pageKeywords: page.keywords,
          siloContext: {
            siloName: silo?.name || 'General',
            pillarPage: pillarPage ? { title: pillarPage.title, slug: pillarPage.slug, keywords: pillarPage.keywords } : null,
            siblingPages,
            internalLinks: internalLinksList,
            brandVoice,
            niche: project.niche,
          },
          wordCountTarget: page.type === 'pillar' ? 3000 : page.type === 'cluster' ? 2000 : 1500,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate article');
      }

      const data = await res.json();
      // Handle both {article: {...}} and raw article object responses
      const articleData = data.article || (data.content ? data : null);
      if (articleData) {
        const article: GeneratedArticle = {
          pageId: page.id,
          title: articleData.title,
          content: articleData.content,
          wordCount: articleData.wordCount,
          internalLinks: articleData.internalLinks || [],
          metaDescription: articleData.metaDescription,
        };
        addGeneratedArticle(article);

        // Save content to page
        updatePage(page.id, {
          content: article.content,
          wordCount: article.wordCount,
          metaDescription: article.metaDescription,
          status: 'in_progress',
        });

        // Update in DB if project saved
        const { savedProjectId, token: t } = useStore.getState();
        if (savedProjectId && t) {
          await fetch(`/api/pages/${page.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify({ content: article.content, word_count: article.wordCount, meta_description: article.metaDescription, status: 'in_progress' }),
          }).catch(() => {});
        }

        setViewingArticle(page.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Article generation failed');
    } finally {
      setLoading(false);
    }
  }, [project, token, pages, silos, brandVoice, addGeneratedArticle, updatePage]);

  // Bulk generate for entire silo
  const handleBulkGenerate = useCallback(async (siloId: string) => {
    if (!project || !token) return;
    const silo = silos.find(s => s.id === siloId);
    if (!silo) return;

    const siloPages = pages.filter(p => p.siloId === siloId);
    if (siloPages.length === 0) return;

    setLoading(true);
    setError(null);
    setBulkGeneratingProgress({ current: 0, total: siloPages.length, siloName: silo.name });

    try {
      // Generate one-by-one client-side for progress tracking
      for (let i = 0; i < siloPages.length; i++) {
        const page = siloPages[i];
        setBulkGeneratingProgress({ current: i + 1, total: siloPages.length, siloName: silo.name });
        await handleGenerateArticle(page.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bulk generation failed');
    } finally {
      setLoading(false);
      setBulkGeneratingProgress(null);
    }
  }, [project, token, pages, silos, handleGenerateArticle, setBulkGeneratingProgress]);

  // Push to CMS
  const handlePushToCMS = async (pageId: string, cmsConfig: CMSConfig) => {
    if (!token) return;
    const page = pages.find(p => p.id === pageId);
    if (!page || !page.content) return;

    setCmsPushing(pageId);
    try {
      const res = await fetch('/api/cms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: cmsConfig.type,
          url: cmsConfig.url,
          api_key: cmsConfig.apiKey,
          username: cmsConfig.username,
          password: cmsConfig.password,
          content: {
            title: page.title,
            body: page.content,
            slug: page.slug,
            meta_description: page.metaDescription,
            status: page.status,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setCmsPushResult(prev => ({
          ...prev,
          [pageId]: { success: true, message: data.result?.id ? `Post ID: ${data.result.id}` : 'Pushed successfully' },
        }));
        // Update page status
        updatePage(pageId, { status: 'review' });
      } else {
        setCmsPushResult(prev => ({
          ...prev,
          [pageId]: { success: false, message: data.error || 'Push failed' },
        }));
      }
    } catch (err) {
      setCmsPushResult(prev => ({
        ...prev,
        [pageId]: { success: false, message: err instanceof Error ? err.message : 'Push failed' },
      }));
    } finally {
      setCmsPushing(null);
    }
  };

  // Save CMS config
  const handleSaveCMS = () => {
    const config: CMSConfig = {
      id: uuidv4(),
      ...cmsForm,
      isActive: true,
    };
    addCMSConfig(config);
    setCmsForm({ type: 'wordpress', name: '', url: '', apiKey: '', username: '', password: '' });
  };

  // Export article as HTML
  const handleExportArticle = (pageId: string) => {
    const page = pages.find(p => p.id === pageId);
    if (!page?.content) return;
    const blob = new Blob([page.content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.slug}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!project) return null;

  // Stats
  const pagesWithContent = pages.filter(p => p.content && p.content.length > 50).length;
  const totalWords = pages.reduce((sum, p) => sum + (p.wordCount || 0), 0);

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <PenTool size={24} className="text-emerald-400" />
          Silo-Aware Content Generator
        </h2>
        <p className="text-sm md:text-base text-slate-400">
          Generate articles that are context-aware of your entire silo structure. No keyword cannibalization, proper internal linking, and consistent brand voice.
        </p>
      </div>

      {/* Why Silo-Aware? Banner */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Zap size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-white font-semibold text-sm mb-1">Why Silo-Aware Content Generation?</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Unlike generic AI writers, SiloForge passes your <strong className="text-blue-300">entire silo context</strong> to the AI — it knows what the pillar page covers,
              what sibling articles exist, which anchor texts to use, and which topics to <strong className="text-red-300">avoid</strong> to prevent cannibalization.
              The result is perfectly interlinked, non-overlapping content that builds topical authority.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-400">{pagesWithContent}</div>
          <div className="text-slate-400 text-xs">Articles Generated</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-400">{totalWords.toLocaleString()}</div>
          <div className="text-slate-400 text-xs">Total Words</div>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-purple-400">{pages.length - pagesWithContent}</div>
          <div className="text-slate-400 text-xs">Awaiting Content</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-400">{cmsConfigs.length}</div>
          <div className="text-slate-400 text-xs">CMS Connections</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 mb-6">
        {[
          { key: 'generate', label: 'Generate', icon: <Sparkles size={14} /> },
          { key: 'articles', label: 'Articles', icon: <FileText size={14} /> },
          { key: 'cms', label: 'CMS Push', icon: <Globe size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as 'generate' | 'articles' | 'cms')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Bulk Generation Progress */}
      {bulkGeneratingProgress && (
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw size={20} className="animate-spin text-blue-400" />
            <div>
              <span className="text-blue-300 font-medium text-sm">Bulk generating &quot;{bulkGeneratingProgress.siloName}&quot;</span>
              <span className="text-slate-400 text-xs ml-2">
                {bulkGeneratingProgress.current}/{bulkGeneratingProgress.total} articles
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2.5">
            <div
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${(bulkGeneratingProgress.current / bulkGeneratingProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ===== Generate Tab ===== */}
      {activeTab === 'generate' && (
        <div>
          {/* Brand Voice Setting */}
          <div className="mb-6 bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
              <Edit3 size={14} className="text-purple-400" />
              Brand Voice
            </h3>
            <p className="text-slate-400 text-xs mb-3">
              Define your brand voice to ensure consistent tone across all generated articles.
            </p>
            <input
              type="text"
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="e.g., professional yet approachable, witty and casual, authoritative"
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Silo-by-silo generation */}
          <div className="space-y-4">
            {pagesBySilo.map(({ silo, pages: siloPages }) => {
              const articlesGenerated = siloPages.filter(p => p.content && p.content.length > 50).length;
              return (
                <div key={silo.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                  {/* Silo Header with Bulk Generate */}
                  <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div>
                      <h3 className="text-white font-semibold text-sm">{silo.name}</h3>
                      <p className="text-slate-500 text-xs">
                        {siloPages.length} pages — {articlesGenerated} articles generated
                      </p>
                    </div>
                    <button
                      onClick={() => handleBulkGenerate(silo.id)}
                      disabled={loading || siloPages.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                    >
                      {loading && bulkGeneratingProgress?.siloName === silo.name ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Zap size={14} />
                      )}
                      Bulk Generate All
                    </button>
                  </div>

                  {/* Pages in silo */}
                  <div className="divide-y divide-slate-700/50">
                    {siloPages.map(page => {
                      const hasContent = pageHasContent(page.id);
                      const isGenerating = loading && selectedPageId === page.id;
                      return (
                        <div
                          key={page.id}
                          className="flex items-center gap-3 p-3 hover:bg-slate-800/50 transition-colors"
                        >
                          <PageTypeBadge type={page.type} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-xs font-medium truncate">{page.title}</div>
                            <div className="text-slate-500 text-[10px] flex items-center gap-2">
                              <span>/{page.slug}</span>
                              {page.wordCount ? <span>— {page.wordCount.toLocaleString()} words</span> : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {hasContent ? (
                              <>
                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-medium">
                                  Generated
                                </span>
                                <button
                                  onClick={() => { setViewingArticle(page.id); setActiveTab('articles'); }}
                                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                                  title="View article"
                                >
                                  <Eye size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleGenerateArticle(page.id)}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-[11px] font-medium hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
                              >
                                {isGenerating ? (
                                  <RefreshCw size={12} className="animate-spin" />
                                ) : (
                                  <Sparkles size={12} />
                                )}
                                {isGenerating ? 'Writing...' : 'Generate'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {silos.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Layers size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-lg mb-2">No Silos Created</p>
                <p className="text-sm mb-4">Create silos first, then generate content for them.</p>
                <button onClick={() => setStep(2)} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">Create Silos</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Articles Tab ===== */}
      {activeTab === 'articles' && (
        <div>
          {viewingArticle ? (() => {
            const page = pages.find(p => p.id === viewingArticle);
            if (!page || !page.content) return null;
            const silo = silos.find(s => s.id === page.siloId);
            const article = getArticleForPage(page.id);
            const isEditing = editingContent !== null;

            return (
              <div>
                {/* Article Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setViewingArticle(null); setEditingContent(null); }}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      ← Back
                    </button>
                    <PageTypeBadge type={page.type} />
                    <div>
                      <h3 className="text-white font-semibold text-sm">{page.title}</h3>
                      <p className="text-slate-500 text-xs">{silo?.name} — {page.wordCount?.toLocaleString() || 0} words</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingContent(isEditing ? null : page.content)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isEditing ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      <Edit3 size={12} />
                      {isEditing ? 'Editing' : 'Edit'}
                    </button>
                    <button
                      onClick={() => handleExportArticle(page.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600"
                    >
                      <Download size={12} />
                      Export HTML
                    </button>
                    {cmsConfigs.length > 0 && (
                      <button
                        onClick={() => setActiveTab('cms')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/30"
                      >
                        <Send size={12} />
                        Push to CMS
                      </button>
                    )}
                  </div>
                </div>

                {/* Internal Links in Article */}
                {article && article.internalLinks.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                    <h4 className="text-blue-300 text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <Link2 size={12} />
                      Internal Links in Article ({article.internalLinks.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {article.internalLinks.map((link, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-300 rounded text-[11px]">
                          &quot;{link.anchor}&quot; → /{link.targetSlug}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content */}
                {isEditing ? (
                  <div>
                    <textarea
                      value={editingContent || ''}
                      onChange={(e) => setEditingContent(e.target.value)}
                      className="w-full min-h-[500px] px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-y"
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={async () => {
                          const wordCount = editingContent.split(/\s+/).filter(Boolean).length;
                          updatePage(page.id, { content: editingContent, wordCount });
                          setEditingContent(null);
                          // Save to DB
                          const { savedProjectId, token: t } = useStore.getState();
                          if (savedProjectId && t) {
                            await fetch(`/api/pages/${page.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
                              body: JSON.stringify({ content: editingContent, word_count: wordCount }),
                            }).catch(() => {});
                          }
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
                      >
                        <CheckCircle2 size={14} />
                        Save Changes
                      </button>
                      <button
                        onClick={() => setEditingContent(null)}
                        className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl p-6 md:p-8 prose prose-slate max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHTML(page.content) }} />
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="space-y-3">
              {pages.filter(p => p.content && p.content.length > 50).length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <FileText size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-lg mb-2">No Articles Generated Yet</p>
                  <p className="text-sm mb-4">Go to the Generate tab to create silo-aware articles.</p>
                  <button onClick={() => setActiveTab('generate')} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
                    Start Generating
                  </button>
                </div>
              ) : (
                pages.filter(p => p.content && p.content.length > 50).map(page => {
                  const silo = silos.find(s => s.id === page.siloId);
                  const article = getArticleForPage(page.id);
                  return (
                    <div
                      key={page.id}
                      className="p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors cursor-pointer"
                      onClick={() => setViewingArticle(page.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <PageTypeBadge type={page.type} size="sm" />
                          <h4 className="text-white font-medium text-sm">{page.title}</h4>
                        </div>
                        <span className="text-slate-500 text-xs">{page.wordCount?.toLocaleString() || 0} words</span>
                      </div>
                      <p className="text-slate-400 text-xs mb-2 line-clamp-2">{page.metaDescription}</p>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-blue-300">{silo?.name || 'No Silo'}</span>
                        {article && (
                          <span className="text-purple-300 flex items-center gap-1">
                            <Link2 size={10} /> {article.internalLinks.length} internal links
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          page.status === 'published' ? 'bg-emerald-500/20 text-emerald-300' :
                          page.status === 'review' ? 'bg-amber-500/20 text-amber-300' :
                          page.status === 'in_progress' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {page.status || 'draft'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== CMS Push Tab ===== */}
      {activeTab === 'cms' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CMS Configurations */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">CMS Connections</h3>

            {/* Add new CMS */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <h4 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <Plus size={14} className="text-blue-400" />
                Add CMS Connection
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Type</label>
                  <select
                    value={cmsForm.type}
                    onChange={(e) => setCmsForm(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="wordpress">WordPress (REST API)</option>
                    <option value="webhook">Webhook (Generic)</option>
                    <option value="headless">Headless CMS (API)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Name</label>
                  <input
                    type="text"
                    value={cmsForm.name}
                    onChange={(e) => setCmsForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="My WordPress Site"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">URL</label>
                  <input
                    type="url"
                    value={cmsForm.url}
                    onChange={(e) => setCmsForm(prev => ({ ...prev, url: e.target.value }))}
                    placeholder={cmsForm.type === 'wordpress' ? 'https://mysite.com' : 'https://api.mysite.com/webhook'}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                {cmsForm.type === 'wordpress' ? (
                  <>
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">Username</label>
                      <input
                        type="text"
                        value={cmsForm.username}
                        onChange={(e) => setCmsForm(prev => ({ ...prev, username: e.target.value }))}
                        placeholder="admin"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">Application Password</label>
                      <input
                        type="password"
                        value={cmsForm.password}
                        onChange={(e) => setCmsForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Generated from WP Admin > Users > Application Passwords"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">API Key</label>
                    <input
                      type="password"
                      value={cmsForm.apiKey}
                      onChange={(e) => setCmsForm(prev => ({ ...prev, apiKey: e.target.value }))}
                      placeholder="Your API key or bearer token"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
                <button
                  onClick={handleSaveCMS}
                  disabled={!cmsForm.name || !cmsForm.url}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                >
                  <Plus size={14} />
                  Add Connection
                </button>
              </div>
            </div>

            {/* Existing connections */}
            {cmsConfigs.length > 0 && (
              <div className="space-y-2">
                {cmsConfigs.map(config => (
                  <div key={config.id} className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        config.type === 'wordpress' ? 'bg-blue-500/20' : config.type === 'headless' ? 'bg-purple-500/20' : 'bg-emerald-500/20'
                      }`}>
                        {config.type === 'wordpress' ? <Globe size={14} className="text-blue-400" /> :
                         config.type === 'headless' ? <Key size={14} className="text-purple-400" /> :
                         <Send size={14} className="text-emerald-400" />}
                      </div>
                      <div>
                        <div className="text-white text-xs font-medium">{config.name}</div>
                        <div className="text-slate-500 text-[10px]">{config.type} — {config.url}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeCMSConfig(config.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Push Articles */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Push Articles to CMS</h3>
            {cmsConfigs.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                <Globe size={32} className="mx-auto mb-2 opacity-30" />
                <p>Add a CMS connection first</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pages.filter(p => p.content && p.content.length > 50).map(page => {
                  const silo = silos.find(s => s.id === page.siloId);
                  const pushResult = cmsPushResult[page.id];
                  const isPushing = cmsPushing === page.id;

                  return (
                    <div key={page.id} className="p-3 bg-slate-800 border border-slate-700 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <PageTypeBadge type={page.type} size="sm" />
                          <span className="text-white text-xs font-medium truncate max-w-[200px]">{page.title}</span>
                        </div>
                        <span className="text-slate-500 text-[10px]">{page.wordCount?.toLocaleString()} words</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {cmsConfigs.map(config => (
                          <button
                            key={config.id}
                            onClick={() => handlePushToCMS(page.id, config)}
                            disabled={isPushing}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-[11px] hover:bg-slate-600 disabled:opacity-50"
                          >
                            {isPushing ? <RefreshCw size={10} className="animate-spin" /> : <Send size={10} />}
                            Push to {config.name}
                          </button>
                        ))}
                      </div>
                      {pushResult && (
                        <div className={`mt-2 p-2 rounded text-[11px] ${
                          pushResult.success ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                        }`}>
                          {pushResult.success ? <CheckCircle2 size={12} className="inline mr-1" /> : <AlertTriangle size={12} className="inline mr-1" />}
                          {pushResult.message}
                        </div>
                      )}
                    </div>
                  );
                })}
                {pages.filter(p => p.content && p.content.length > 50).length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Generate articles first, then push them to your CMS.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(10)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          Back to Content Briefs
        </button>
        <button
          onClick={() => setStep(7)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Silo Builder
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
