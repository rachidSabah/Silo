'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import PageTypeBadge from './PageTypeBadge';
import VisualTree from './VisualTree';
import {
  ArrowLeft,
  Download,
  Save,
  Database,
  FolderOpen,
  Trash2,
  BarChart3,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';

interface SavedProject {
  id: string;
  name: string;
  domain: string;
  language: string;
  niche: string | null;
  seed_keywords: string | null;
  created_at: string;
}

export default function Step5ExportSave() {
  const { project, silos, pages, setStep, setProject, setSilos, setPages, setSavedProjectId, savedProjectId, resetStore, token } = useStore();
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'export' | 'saved' | 'tree'>('export');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ALL hooks must be called before any conditional returns
  // Redirect guard
  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/projects', { headers });
      const data = await res.json();
      setSavedProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [token]);

  // Load saved projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDownloadCSV = useCallback(() => {
    if (!project || pages.length === 0) return;

    try {
      const csvContent = [
        ['slug', 'title', 'meta_description', 'keywords', 'type', 'parent_silo', 'status'].join(','),
        ...pages.map((p) => {
          const siloName = silos.find((s) => s.id === p.siloId)?.name || '';
          return [
            `"${p.slug}"`,
            `"${p.title.replace(/"/g, '""')}"`,
            `"${(p.metaDescription || '').replace(/"/g, '""')}"`,
            `"${p.keywords.join('; ')}"`,
            p.type,
            `"${siloName}"`,
            p.status || 'draft',
          ].join(',');
        }),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `siloforge-${project.domain}-pages.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [pages, silos, project]);

  // Type counts - computed before conditional return
  const typeCounts = pages.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalKeywords = pages.reduce((sum, p) => sum + p.keywords.length, 0);

  // Save project to database
  const handleSave = async () => {
    if (!project) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const saveHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) saveHeaders['Authorization'] = `Bearer ${token}`;

      const projectRes = await fetch('/api/projects', {
        method: 'POST',
        headers: saveHeaders,
        body: JSON.stringify({
          id: project.id,
          name: project.name,
          domain: project.domain,
          language: project.language,
          niche: project.niche,
          seedKeywords: project.seedKeywords,
        }),
      });

      if (!projectRes.ok) {
        throw new Error('Failed to save project');
      }

      for (const silo of silos) {
        await fetch('/api/silos', {
          method: 'POST',
          headers: saveHeaders,
          body: JSON.stringify({
            id: silo.id,
            project_id: project.id,
            name: silo.name,
            keywords: silo.keywords ? JSON.stringify(silo.keywords) : null,
          }),
        });
      }

      for (const page of pages) {
        await fetch('/api/pages', {
          method: 'POST',
          headers: saveHeaders,
          body: JSON.stringify({
            id: page.id,
            project_id: project.id,
            silo_id: page.siloId || null,
            title: page.title,
            slug: page.slug,
            meta_description: page.metaDescription,
            keywords: JSON.stringify(page.keywords),
            type: page.type,
            parent_id: page.parentId,
            status: page.status || 'draft',
          }),
        });
      }

      setSavedProjectId(project.id);
      setSaveMessage({ type: 'success', text: 'Project saved to database successfully!' });
      loadProjects();
    } catch (err) {
      console.error('Save failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save project. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Load project from DB
  const handleLoadProject = async (projectId: string) => {
    try {
      const loadHeaders: Record<string, string> = {};
      if (token) loadHeaders['Authorization'] = `Bearer ${token}`;

      const projectRes = await fetch(`/api/projects/${projectId}`, { headers: loadHeaders });
      const proj = await projectRes.json();

      const silosRes = await fetch(`/api/silos?project_id=${projectId}`, { headers: loadHeaders });
      const dbSilos = await silosRes.json();

      const pagesRes = await fetch(`/api/pages?project_id=${projectId}`, { headers: loadHeaders });
      const dbPages = await pagesRes.json();

      setProject({
        id: proj.id,
        name: proj.name,
        domain: proj.domain,
        language: proj.language || 'en',
        niche: proj.niche || '',
        seedKeywords: proj.seed_keywords ? JSON.parse(proj.seed_keywords) : [],
      });

      setSilos(
        (dbSilos || []).map((s: { id: string; project_id: string; name: string; keywords?: string | null }) => ({
          id: s.id,
          projectId: s.project_id,
          name: s.name,
          keywords: s.keywords ? JSON.parse(s.keywords) : [],
        }))
      );

      setPages(
        (dbPages || []).map((p: { id: string; project_id: string; silo_id: string | null; title: string; slug: string; meta_description: string; keywords: string; type: string; parent_id: string | null; status?: string }) => ({
          id: p.id,
          projectId: p.project_id,
          siloId: p.silo_id,
          title: p.title,
          slug: p.slug,
          metaDescription: p.meta_description || '',
          keywords: p.keywords ? JSON.parse(p.keywords) : [],
          type: (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(p.type) ? p.type : 'blog') as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing',
          parentId: p.parent_id,
          status: (['draft', 'in_progress', 'review', 'published'].includes(p.status || '') ? p.status : 'draft') as 'draft' | 'in_progress' | 'review' | 'published',
        }))
      );

      setSavedProjectId(projectId);
      setStep(2);
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  // Delete project
  const handleDeleteProject = async (projectId: string) => {
    if (deleteConfirm === projectId) {
      try {
        const delHeaders: Record<string, string> = {};
        if (token) delHeaders['Authorization'] = `Bearer ${token}`;
        await fetch(`/api/projects/${projectId}`, { method: 'DELETE', headers: delHeaders });
        loadProjects();
        setDeleteConfirm(null);
        if (savedProjectId === projectId) {
          resetStore();
        }
      } catch (err) {
        console.error('Failed to delete project:', err);
      }
    } else {
      setDeleteConfirm(projectId);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  // Conditional return AFTER all hooks
  if (!project) return null;

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Export & Save</h2>
        <p className="text-sm md:text-base text-slate-400">
          Save your project to the database, export pages as CSV, and review your complete SEO architecture.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'export'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Export & Save
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'saved'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Saved Projects
        </button>
        <button
          onClick={() => setActiveTab('tree')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'tree'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Visual Overview
        </button>
      </div>

      {/* Save message */}
      {saveMessage && (
        <div className={`p-3 mb-6 rounded-lg text-sm ${
          saveMessage.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {saveMessage.text}
        </div>
      )}

      {activeTab === 'export' && (
        <>
          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Save Card */}
            <div className="p-5 md:p-6 bg-slate-800 border border-slate-700 rounded-xl hover:border-blue-500/30 transition-colors">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-3 md:mb-4">
                <Database size={20} className="text-blue-400 md:w-6 md:h-6" />
              </div>
              <h3 className="text-white font-semibold mb-2">Save to Database</h3>
              <p className="text-slate-500 text-sm mb-4">
                Persist your project, silos, and pages to the cloud database for later access and editing.
              </p>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors shadow-lg shadow-blue-500/20"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Save Project
                  </>
                )}
              </button>
              {savedProjectId && (
                <p className="text-emerald-400/70 text-xs mt-2 text-center">
                  Last saved to database
                </p>
              )}
            </div>

            {/* Export CSV Card */}
            <div className="p-5 md:p-6 bg-slate-800 border border-slate-700 rounded-xl hover:border-emerald-500/30 transition-colors">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-3 md:mb-4">
                <Download size={20} className="text-emerald-400 md:w-6 md:h-6" />
              </div>
              <h3 className="text-white font-semibold mb-2">Download CSV</h3>
              <p className="text-slate-500 text-sm mb-4">
                Export all {pages.length} pages as a CSV file with slug, title, meta description, keywords, type, and parent silo.
              </p>
              <button
                onClick={handleDownloadCSV}
                disabled={pages.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
              >
                <Download size={16} />
                Download CSV
              </button>
            </div>
          </div>

          {/* Project Summary */}
          <div className="p-4 md:p-6 bg-slate-800/50 border border-slate-700 rounded-xl mb-6">
            <h3 className="text-base md:text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-blue-400" />
              Project Summary
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
              <div className="p-3 md:p-4 bg-slate-900 rounded-lg text-center">
                <p className="text-2xl md:text-3xl font-bold text-white">{pages.length}</p>
                <p className="text-xs md:text-sm text-slate-500">Total Pages</p>
              </div>
              <div className="p-3 md:p-4 bg-slate-900 rounded-lg text-center">
                <p className="text-2xl md:text-3xl font-bold text-white">{silos.length}</p>
                <p className="text-xs md:text-sm text-slate-500">Content Silos</p>
              </div>
              <div className="p-3 md:p-4 bg-slate-900 rounded-lg text-center">
                <p className="text-2xl md:text-3xl font-bold text-white">{typeCounts['pillar'] || 0}</p>
                <p className="text-xs md:text-sm text-slate-500">Pillar Pages</p>
              </div>
              <div className="p-3 md:p-4 bg-slate-900 rounded-lg text-center">
                <p className="text-2xl md:text-3xl font-bold text-white">{totalKeywords}</p>
                <p className="text-xs md:text-sm text-slate-500">Total Keywords</p>
              </div>
            </div>

            {/* Type breakdown */}
            <div className="flex flex-wrap gap-2 md:gap-3">
              {(['pillar', 'cluster', 'blog', 'category', 'landing'] as const).map((type) => (
                <div key={type} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-lg">
                  <PageTypeBadge type={type} />
                  <span className="text-white font-bold text-sm">{typeCounts[type] || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* New Project */}
          <button
            onClick={resetStore}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            <Plus size={16} />
            Start New Project
          </button>
        </>
      )}

      {activeTab === 'saved' && (
        <>
          {isLoadingProjects ? (
            <div className="text-center py-12 text-slate-500">
              <Loader2 size={24} className="animate-spin mx-auto mb-3" />
              <p>Loading projects...</p>
            </div>
          ) : savedProjects.length === 0 ? (
            <div className="text-center py-12 md:py-16 text-slate-500">
              <FolderOpen size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No saved projects yet</p>
              <p className="text-sm">Save your current project to see it here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium truncate">{proj.name}</p>
                    <p className="text-slate-500 text-sm">
                      {proj.domain} · {proj.language?.toUpperCase()} · Created {new Date(proj.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleLoadProject(proj.id)}
                      className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition-colors"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDeleteProject(proj.id)}
                      className={`p-1.5 rounded transition-all ${
                        deleteConfirm === proj.id
                          ? 'text-red-400 bg-red-500/20'
                          : 'text-slate-500 hover:text-red-400'
                      }`}
                      title={deleteConfirm === proj.id ? 'Click again to confirm' : 'Delete project'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {deleteConfirm === proj.id && (
                    <p className="text-red-400 text-xs sm:hidden">Click trash again to confirm</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={loadProjects}
            className="flex items-center gap-2 mt-4 px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </>
      )}

      {activeTab === 'tree' && (
        <VisualTree />
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(4)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={18} />
          Back
        </button>
      </div>
    </div>
  );
}
