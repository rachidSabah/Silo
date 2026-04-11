'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useAutoSave } from '@/lib/useAutoSave';
import {
  Check, Zap, Menu, X, Shield, Key, LogOut, User,
  BarChart3, Calendar, FileText, Network, Link2, Brain, PenTool,
  Globe, TrendingUp, FileDown, Save, Loader2, Cloud, CloudOff,
  FolderOpen, ChevronDown, Pencil,
} from 'lucide-react';

const workflowSteps = [
  { num: 0, label: 'Dashboard', icon: BarChart3 },
  { num: 1, label: 'Project Setup', icon: null },
  { num: 2, label: 'Silo Structure', icon: null },
  { num: 3, label: 'Semantic Gen', icon: null },
  { num: 4, label: 'Page Manager', icon: null },
  { num: 6, label: 'Content Calendar', icon: Calendar },
  { num: 5, label: 'Export & Save', icon: null },
];

const toolSteps = [
  { num: 7, label: 'Silo Builder', icon: Network, color: 'emerald' },
  { num: 8, label: 'Linking Engine', icon: Link2, color: 'red' },
  { num: 9, label: 'Keyword Intel', icon: Brain, color: 'purple' },
  { num: 10, label: 'Content Briefs', icon: PenTool, color: 'amber' },
  { num: 11, label: 'Article Writer', icon: FileText, color: 'emerald' },
  { num: 12, label: 'GSC Analytics', icon: TrendingUp, color: 'blue' },
  { num: 13, label: 'Competitor Import', icon: Globe, color: 'amber' },
  { num: 14, label: 'PDF Export', icon: FileDown, color: 'purple' },
];

export default function Sidebar() {
  const { currentStep, setStep, project, silos, pages, user, logout, isDirty, isSaving, token, setProject, setSilos, setPages, setInternalLinks, setSavedProjectId } = useStore();
  const { saveProject } = useAutoSave();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);
  const [allProjects, setAllProjects] = useState<Array<{ id: string; name: string; domain: string; created_at: string }>>([]);

  const isAdmin = user?.role === 'admin';

  // Load projects for switcher
  useEffect(() => {
    if (token) {
      fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setAllProjects(data); })
        .catch(() => {});
    }
  }, [token, project?.id]); // reload when project changes

  // Safely parse keywords
  function safeParseKeywords(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [String(parsed)];
    } catch {
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  // Switch to another project
  const handleSwitchProject = async (projectId: string) => {
    if (projectId === project?.id) {
      setShowProjectSwitcher(false);
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const projRes = await fetch(`/api/projects/${projectId}`, { headers });
      const proj = await projRes.json();
      const silosRes = await fetch(`/api/silos?project_id=${projectId}`, { headers });
      const dbSilos = await silosRes.json();
      const pagesRes = await fetch(`/api/pages?project_id=${projectId}`, { headers });
      const dbPages = await pagesRes.json();
      const linksRes = await fetch(`/api/internal-links?project_id=${projectId}`, { headers });
      const dbLinks = await linksRes.json();

      setProject({
        id: proj.id, name: proj.name, domain: proj.domain,
        language: proj.language || 'en', niche: proj.niche || '',
        seedKeywords: safeParseKeywords(proj.seed_keywords),
      });
      setSilos((dbSilos || []).map((s: any) => ({
        id: s.id, projectId: s.project_id, name: s.name, keywords: safeParseKeywords(s.keywords),
      })));
      setPages((dbPages || []).map((p: any) => ({
        id: p.id, projectId: p.project_id, siloId: p.silo_id, title: p.title,
        slug: p.slug, metaDescription: p.meta_description || '',
        keywords: safeParseKeywords(p.keywords),
        type: (['pillar','cluster','blog','category','landing'].includes(p.type) ? p.type : 'blog') as any,
        parentId: p.parent_id,
        status: (['draft','in_progress','review','published'].includes(p.status||'') ? p.status : 'draft') as any,
        content: p.content || '', wordCount: p.word_count || 0,
      })));
      setInternalLinks((dbLinks || []).map((l: any) => ({
        id: l.id, projectId: l.project_id, fromPageId: l.from_page_id,
        toPageId: l.to_page_id, anchor: l.anchor,
      })));
      setSavedProjectId(projectId);
      setShowProjectSwitcher(false);
      setStep(0); // go to dashboard
    } catch (err) {
      console.error('Failed to switch project:', err);
    }
  };

  const isStepAccessible = (step: number): boolean => {
    if (step === 0) return true; // Dashboard always accessible
    if (step === 1) return true;
    if (step === 2) return !!project;
    if (step === 3) return !!project && silos.length > 0;
    if (step === 4) return !!project && pages.length > 0;
    if (step === 5) return !!project && pages.length > 0;
    if (step === 6) return !!project && pages.length > 0;
    if (step === 7) return !!project && silos.length > 0; // Silo Builder
    if (step === 8) return !!project && pages.length > 0; // Linking Engine
    if (step === 9) return !!project; // Keyword Intel
    if (step === 10) return !!project && pages.length > 0; // Content Briefs
    if (step === 11) return !!project && pages.length > 0; // Article Writer
    if (step === 12) return !!project; // GSC Analytics
    if (step === 13) return true; // Competitor Import (always accessible)
    if (step === 14) return !!project && pages.length > 0; // PDF Export
    if (step === 99) return true;
    return false;
  };

  const isStepCompleted = (step: number): boolean => {
    if (step === 0) return false; // Dashboard never "completed"
    if (step === 1) return !!project;
    if (step === 2) return silos.length > 0;
    if (step === 3) return pages.length > 0;
    return false;
  };

  const handleStepClick = (step: number) => {
    if (isStepAccessible(step)) {
      setStep(step);
      setMobileOpen(false);
    }
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    logout();
    setMobileOpen(false);
  };

  // SEO stats for footer
  const publishedCount = pages.filter(p => p.status === 'published').length;
  const draftCount = pages.filter(p => p.status === 'draft' || !p.status).length;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 md:p-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">SiloForge</h1>
            <p className="text-[10px] md:text-[11px] text-slate-500">SEO Architecture Builder</p>
          </div>
        </div>

        {/* Project Switcher */}
        {project && (
          <div className="mt-3 relative">
            <button
              onClick={() => setShowProjectSwitcher(!showProjectSwitcher)}
              className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <FolderOpen size={14} className="text-blue-400" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white text-xs font-medium truncate">{project.name}</p>
                <p className="text-slate-500 text-[10px] truncate">{project.domain}</p>
              </div>
              {allProjects.length > 1 && (
                <ChevronDown size={12} className={`text-slate-500 transition-transform ${showProjectSwitcher ? 'rotate-180' : ''}`} />
              )}
            </button>

            {/* Project Switcher Dropdown */}
            {showProjectSwitcher && allProjects.length > 1 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                {allProjects
                  .filter(p => p.id !== project?.id)
                  .map(p => (
                  <button key={p.id}
                    onClick={() => handleSwitchProject(p.id)}
                    className="w-full text-left p-2.5 hover:bg-slate-700 transition-colors flex items-center gap-2"
                  >
                    <FolderOpen size={12} className="text-slate-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white text-xs font-medium truncate">{p.name}</p>
                      <p className="text-slate-500 text-[10px] truncate">{p.domain}</p>
                    </div>
                  </button>
                ))}
                <div className="border-t border-slate-700">
                  <button
                    onClick={() => { setStep(1); setShowProjectSwitcher(false); }}
                    className="w-full text-left p-2.5 hover:bg-slate-700 transition-colors text-blue-400 text-xs font-medium"
                  >
                    + New Project
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Save status + button */}
        {project && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => saveProject()}
              disabled={isSaving || !isDirty}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isSaving
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : isDirty
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Saving...
                </>
              ) : isDirty ? (
                <>
                  <CloudOff size={12} />
                  Unsaved changes
                </>
              ) : (
                <>
                  <Cloud size={12} />
                  Saved
                </>
              )}
            </button>
            {isDirty && !isSaving && (
              <button
                onClick={() => saveProject()}
                className="p-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors"
                title="Save now"
              >
                <Save size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Step Navigation */}
      <nav className="flex-1 p-3 md:p-4 space-y-1 overflow-y-auto">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider px-3 md:px-4 mb-2">Workflow</p>
        {workflowSteps.map((step) => {
          const isActive = currentStep === step.num;
          const isCompleted = isStepCompleted(step.num);
          const isAccessible = isStepAccessible(step.num);
          const IconComponent = step.icon;

          return (
            <button
              key={step.num}
              onClick={() => handleStepClick(step.num)}
              disabled={!isAccessible}
              className={`w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl text-left transition-all duration-200 ${
                isActive
                  ? step.num === 0
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                    : step.num === 6
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-lg shadow-blue-500/5'
                  : isCompleted
                  ? 'text-slate-300 hover:bg-slate-800 border border-transparent'
                  : isAccessible
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-300 border border-transparent'
                  : 'text-slate-600 cursor-not-allowed border border-transparent'
              }`}
            >
              <div
                className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-xs md:text-sm font-semibold transition-all flex-shrink-0 ${
                  isActive
                    ? step.num === 0
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : step.num === 6
                      ? 'bg-amber-500 text-white'
                      : 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700/50 text-slate-500'
                }`}
              >
                {IconComponent ? <IconComponent size={14} /> : isCompleted && !isActive ? <Check size={14} /> : step.num}
              </div>
              <span className="text-xs md:text-sm font-medium">{step.label}</span>
            </button>
          );
        })}

        {/* SEO Tools Section */}
        <div className="pt-4 mt-4 border-t border-slate-700/50">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider px-3 md:px-4 mb-2">SEO Tools</p>
          {toolSteps.map((step) => {
            const isActive = currentStep === step.num;
            const isAccessible = isStepAccessible(step.num);
            const IconComponent = step.icon;
            const colorMap: Record<string, { activeBg: string; activeText: string; activeBorder: string }> = {
              emerald: { activeBg: 'bg-emerald-500/15', activeText: 'text-emerald-300', activeBorder: 'border-emerald-500/30' },
              red: { activeBg: 'bg-red-500/15', activeText: 'text-red-300', activeBorder: 'border-red-500/30' },
              purple: { activeBg: 'bg-purple-500/15', activeText: 'text-purple-300', activeBorder: 'border-purple-500/30' },
              amber: { activeBg: 'bg-amber-500/15', activeText: 'text-amber-300', activeBorder: 'border-amber-500/30' },
              blue: { activeBg: 'bg-blue-500/15', activeText: 'text-blue-300', activeBorder: 'border-blue-500/30' },
            };const color = colorMap[step.color] || colorMap.emerald;

            return (
              <button
                key={step.num}
                onClick={() => handleStepClick(step.num)}
                disabled={!isAccessible}
                className={`w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl text-left transition-all duration-200 ${
                  isActive
                    ? `${color.activeBg} ${color.activeText} border ${color.activeBorder}`
                    : isAccessible
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-300 border border-transparent'
                    : 'text-slate-600 cursor-not-allowed border border-transparent'
                }`}
              >
                <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isActive ? 'bg-slate-700 text-white' : 'bg-slate-700/50 text-slate-500'
                }`}>
                  <IconComponent size={14} />
                </div>
                <span className="text-xs md:text-sm font-medium">{step.label}</span>
              </button>
            );
          })}
        </div>

        {/* Admin Section */}
        <div className="pt-4 mt-4 border-t border-slate-700/50">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider px-3 md:px-4 mb-2">Manage</p>
          <button
            onClick={() => { setStep(99); setMobileOpen(false); }}
            className={`w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl text-left transition-all duration-200 ${
              currentStep === 99
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300 border border-transparent'
            }`}
          >
            <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              currentStep === 99 ? 'bg-amber-500 text-white' : 'bg-slate-700/50 text-slate-500'
            }`}>
              <Shield size={14} />
            </div>
            <span className="text-xs md:text-sm font-medium">Admin Panel</span>
          </button>
        </div>
      </nav>

      {/* Footer stats */}
      <div className="p-3 md:p-4 border-t border-slate-700">
        <div className="grid grid-cols-3 gap-1.5 md:gap-2 text-center mb-3">
          <div className="bg-slate-800 rounded-lg p-1.5 md:p-2">
            <div className="text-base md:text-lg font-bold text-white">{silos.length}</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Silos</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-1.5 md:p-2">
            <div className="text-base md:text-lg font-bold text-white">{pages.length}</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Pages</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-1.5 md:p-2">
            <div className="text-base md:text-lg font-bold text-emerald-400">{publishedCount}</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Live</div>
          </div>
        </div>

        {/* User info */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-xs font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-slate-500 text-[10px] truncate">{user?.email || ''}</p>
            </div>
            {isAdmin && (
              <span className="px-1 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[8px] font-medium flex-shrink-0">ADM</span>
            )}
          </button>

          {/* User dropdown */}
          {showUserMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-10">
              <button
                onClick={() => { setStep(0); setShowUserMenu(false); setMobileOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-700 text-xs transition-colors"
              >
                <BarChart3 size={14} />
                Dashboard
              </button>
              <button
                onClick={() => { setStep(99); setShowUserMenu(false); setMobileOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-700 text-xs transition-colors"
              >
                <Shield size={14} />
                Admin Panel
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-red-300 hover:bg-slate-700 text-xs transition-colors"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-slate-800 border border-slate-700 rounded-lg text-white shadow-lg"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[280px] bg-slate-900 border-r border-slate-700 flex flex-col transform transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white transition-colors"
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[260px] min-w-[260px] bg-slate-900 border-r border-slate-700 flex-col h-full overflow-y-auto">
        {sidebarContent}
      </aside>
    </>
  );
}
