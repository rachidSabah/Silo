'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { v4 as uuidv4 } from 'uuid';
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
  Eye,
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
  const { project, silos, pages, setStep, setProject, setSilos, setPages, setSavedProjectId, savedProjectId, resetStore } = useStore();
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'export' | 'saved' | 'tree'>('export');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Type counts
  const typeCounts = pages.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalKeywords = pages.reduce((sum, p) => sum + p.keywords.length, 0);

  // Load saved projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setSavedProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Save project to database
  const handleSave = async () => {
    if (!project) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Save project
      const projectRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // Save silos
      for (const silo of silos) {
        await fetch('/api/silos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: silo.id,
            project_id: project.id,
            name: silo.name,
          }),
        });
      }

      // Save pages
      for (const page of pages) {
        await fetch('/api/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  // Download CSV
  const handleDownloadCSV = useCallback(() => {
    if (!project || pages.length === 0) return;

    try {
      const csvContent = [
        ['slug', 'title', 'meta_description', 'keywords', 'type', 'parent_silo'].join(','),
        ...pages.map((p) => {
          const siloName = silos.find((s) => s.id === p.siloId)?.name || '';
          return [
            `"${p.slug}"`,
            `"${p.title.replace(/"/g, '""')}"`,
            `"${(p.metaDescription || '').replace(/"/g, '""')}"`,
            `"${p.keywords.join('; ')}"`,
            p.type,
            `"${siloName}"`,
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

  // Load project from DB
  const handleLoadProject = async (projectId: string) => {
    try {
      // Load project
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const proj = await projectRes.json();

      // Load silos
      const silosRes = await fetch(`/api/silos?project_id=${projectId}`);
      const dbSilos = await silosRes.json();

      // Load pages
      const pagesRes = await fetch(`/api/pages?project_id=${projectId}`);
      const dbPages = await pagesRes.json();

      // Update store
      setProject({
        id: proj.id,
        name: proj.name,
        domain: proj.domain,
        language: proj.language || 'en',
        niche: proj.niche || '',
        seedKeywords: proj.seed_keywords ? JSON.parse(proj.seed_keywords) : [],
      });

      setSilos(
        (dbSilos || []).map((s: { id: string; project_id: string; name: string }) => ({
          id: s.id,
          projectId: s.project_id,
          name: s.name,
          keywords: [],
        }))
      );

      setPages(
        (dbPages || []).map((p: { id: string; project_id: string; silo_id: string | null; title: string; slug: string; meta_description: string; keywords: string; type: string; parent_id: string | null }) => ({
          id: p.id,
          projectId: p.project_id,
          siloId: p.silo_id,
          title: p.title,
          slug: p.slug,
          metaDescription: p.meta_description || '',
          keywords: p.keywords ? JSON.parse(p.keywords) : [],
          type: (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(p.type) ? p.type : 'blog') as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing',
          parentId: p.parent_id,
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
    try {
      await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  if (!project) {
    setStep(1);
    return null;
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Export & Save</h2>
        <p className="text-slate-400">
          Save your project to the database, export pages as CSV, and review your complete SEO architecture.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'export'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Export & Save
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'saved'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Saved Projects
        </button>
        <button
          onClick={() => setActiveTab('tree')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Save Card */}
            <div className="p-6 bg-slate-800 border border-slate-700 rounded-xl hover:border-blue-500/30 transition-colors">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                <Database size={24} className="text-blue-400" />
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
            <div className="p-6 bg-slate-800 border border-slate-700 rounded-xl hover:border-emerald-500/30 transition-colors">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
                <Download size={24} className="text-emerald-400" />
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
          <div className="p-6 bg-slate-800/50 border border-slate-700 rounded-xl mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 size={20} className="text-blue-400" />
              Project Summary
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-slate-900 rounded-lg text-center">
                <p className="text-3xl font-bold text-white">{pages.length}</p>
                <p className="text-sm text-slate-500">Total Pages</p>
              </div>
              <div className="p-4 bg-slate-900 rounded-lg text-center">
                <p className="text-3xl font-bold text-white">{silos.length}</p>
                <p className="text-sm text-slate-500">Content Silos</p>
              </div>
              <div className="p-4 bg-slate-900 rounded-lg text-center">
                <p className="text-3xl font-bold text-white">{typeCounts['pillar'] || 0}</p>
                <p className="text-sm text-slate-500">Pillar Pages</p>
              </div>
              <div className="p-4 bg-slate-900 rounded-lg text-center">
                <p className="text-3xl font-bold text-white">{totalKeywords}</p>
                <p className="text-sm text-slate-500">Total Keywords</p>
              </div>
            </div>

            {/* Type breakdown */}
            <div className="flex flex-wrap gap-3">
              {(['pillar', 'cluster', 'blog', 'category', 'landing'] as const).map((type) => (
                <div key={type} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-lg">
                  <PageTypeBadge type={type} />
                  <span className="text-white font-bold">{typeCounts[type] || 0}</span>
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
            <div className="text-center py-16 text-slate-500">
              <FolderOpen size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No saved projects yet</p>
              <p className="text-sm">Save your current project to see it here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium truncate">{proj.name}</p>
                    <p className="text-slate-500 text-sm">
                      {proj.domain} · {proj.language?.toUpperCase()} · Created {new Date(proj.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleLoadProject(proj.id)}
                      className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition-colors"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDeleteProject(proj.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
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
      <div className="flex justify-between pt-8 mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(4)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          Back
        </button>
      </div>
    </div>
  );
}
