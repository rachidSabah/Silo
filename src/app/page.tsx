'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useAutoSave } from '@/lib/useAutoSave';
import LoginPage from '@/components/seo/LoginPage';
import Sidebar from '@/components/seo/Sidebar';
import DashboardAnalytics from '@/components/seo/DashboardAnalytics';
import Step1ProjectSetup from '@/components/seo/Step1ProjectSetup';
import Step2SiloStructure from '@/components/seo/Step2SiloStructure';
import Step3SemanticGen from '@/components/seo/Step3SemanticGen';
import Step4PageManagement from '@/components/seo/Step4PageManagement';
import ContentCalendar from '@/components/seo/ContentCalendar';
import Step5ExportSave from '@/components/seo/Step5ExportSave';
import AdminPanel from '@/components/seo/AdminPanel';
import VisualSiloBuilder from '@/components/seo/VisualSiloBuilder';
import InternalLinkingEngine from '@/components/seo/InternalLinkingEngine';
import KeywordIntelligence from '@/components/seo/KeywordIntelligence';
import ContentBriefGenerator from '@/components/seo/ContentBriefGenerator';
import ArticleGenerator from '@/components/seo/ArticleGenerator';
import GSCAnalyticsDashboard from '@/components/seo/GSCAnalyticsDashboard';
import CompetitorImporter from '@/components/seo/CompetitorImporter';
import PDFReportExport from '@/components/seo/PDFReportExport';
import ContentHumanizer from '@/components/seo/ContentHumanizer';
import SERPFeatureTracker from '@/components/seo/SERPFeatureTracker';
import ContentGapAnalyzer from '@/components/seo/ContentGapAnalyzer';
import WPAuditor from '@/components/seo/WPAuditor';
import GeoGridTracker from '@/components/seo/GeoGridTracker';
import GBPManager from '@/components/seo/GBPManager';
import LocalScanAnalyzer from '@/components/seo/LocalScanAnalyzer';
import CitationRadar from '@/components/seo/CitationRadar';
import CompetitorCompare from '@/components/seo/CompetitorCompare';

// Helper to safely parse keywords from D1 (stored as JSON string or comma-separated)
function safeParseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [String(parsed)];
  } catch {
    return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
}

// Error boundary component
import { Component, ReactNode } from 'react';
interface EBState { hasError: boolean; error?: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(e: Error) { return { hasError: true, error: e.message }; }
  render() {
    if (this.state.hasError) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-8">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-slate-400 text-sm mb-4">{this.state.error || 'An unexpected error occurred.'}</p>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">Reload Page</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

export default function Home() {
  const { currentStep, user, token, setUser, setToken, logout } = useStore();

  // Hydration guard: wait for Zustand persist to rehydrate from localStorage
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Zustand persist rehydrates asynchronously; give it a tick to complete
    const t = setTimeout(() => setHydrated(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Token validation: re-run when token changes (i.e., after rehydration or login)
  const validatedRef = useRef(false);
  useEffect(() => {
    // Only validate when we have a token and haven't already validated this token
    if (token && user && !validatedRef.current) {
      validatedRef.current = true;
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) {
            // Token is invalid/expired — force logout
            logout();
            validatedRef.current = false;
          }
          return res.json();
        })
        .then((data) => {
          if (data?.user) setUser(data.user);
        })
        .catch(() => {
          // Network error — don't logout, might be temporary
        });
    }

    // Reset validation flag when token is cleared (logout)
    if (!token) {
      validatedRef.current = false;
    }
  }, [token, user, logout, setUser]);

  // ===== CRITICAL: Reload project data from D1 after page refresh or re-login =====
  // The Zustand store only persists user/token/savedProjectId/currentStep to localStorage.
  // All project data (silos, pages, links) must be reloaded from D1 on refresh.
  const projectLoadedRef = useRef(false);

  // Reset projectLoadedRef when user logs out (token goes null) so it can re-fire on next login
  useEffect(() => {
    if (!token) {
      projectLoadedRef.current = false;
    }
  }, [token]);

  // Helper to load full project data from D1 into Zustand store
  const loadProjectFromDB = async (projectId: string, headers: Record<string, string>) => {
    const { setProject, setSilos, setPages, setInternalLinks, setSavedProjectId, setStep, markSaved } = useStore.getState();

    const [proj, dbSilos, dbPages, dbLinks] = await Promise.all([
      fetch(`/api/projects/${projectId}`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`/api/silos?project_id=${projectId}`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`/api/pages?project_id=${projectId}`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`/api/internal-links?project_id=${projectId}`, { headers }).then(r => r.json()).catch(() => []),
    ]);

    if (proj && proj.id) {
      setProject({
        id: proj.id,
        name: proj.name || '',
        domain: proj.domain || '',
        language: proj.language || 'en',
        niche: proj.niche || '',
        seedKeywords: safeParseKeywords(proj.seed_keywords),
      });
      setSilos((dbSilos || []).map((s: any) => ({
        id: s.id,
        projectId: s.project_id,
        name: s.name,
        keywords: safeParseKeywords(s.keywords),
      })));
      setPages((dbPages || []).map((p: any) => ({
        id: p.id,
        projectId: p.project_id,
        siloId: p.silo_id,
        title: p.title || '',
        slug: p.slug || '',
        metaDescription: p.meta_description || '',
        keywords: safeParseKeywords(p.keywords),
        type: (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(p.type) ? p.type : 'blog') as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing',
        parentId: p.parent_id,
        status: (['draft', 'in_progress', 'review', 'published'].includes(p.status || '') ? p.status : 'draft') as 'draft' | 'in_progress' | 'review' | 'published',
        content: p.content || '',
        wordCount: p.word_count || 0,
        targetKeyword: p.target_keyword || undefined,
        searchIntent: p.search_intent || undefined,
        suggestedParentKeyword: p.suggested_parent_keyword || undefined,
      })));
      setInternalLinks((dbLinks || []).map((l: any) => ({
        id: l.id,
        projectId: l.project_id,
        fromPageId: l.from_page_id,
        toPageId: l.to_page_id,
        anchor: l.anchor,
      })));
      setSavedProjectId(projectId);
      markSaved();
      console.log('[SiloForge] Project data reloaded from D1:', projectId);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!token || !user || projectLoadedRef.current) return;

    projectLoadedRef.current = true;
    const { savedProjectId, setSavedProjectId, setStep } = useStore.getState();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

    if (savedProjectId) {
      // Load the previously saved project
      loadProjectFromDB(savedProjectId, headers)
        .then((loaded) => {
          if (!loaded) {
            // savedProjectId project not found in DB — try loading most recent project
            setSavedProjectId(null);
            return tryLoadMostRecentProject(headers);
          }
        })
        .catch((err) => {
          console.error('[SiloForge] Failed to reload project data:', err);
        });
    } else {
      // No savedProjectId — try loading the user's most recent project from D1
      tryLoadMostRecentProject(headers);
    }
  }, [token, user]);

  // Fallback: load the user's most recent project if savedProjectId is missing
  const tryLoadMostRecentProject = async (headers: Record<string, string>) => {
    try {
      const res = await fetch('/api/projects', { headers });
      const projects = await res.json();
      if (Array.isArray(projects) && projects.length > 0) {
        // Load the most recent project
        const mostRecent = projects[0]; // already sorted by created_at DESC from DB
        console.log('[SiloForge] Auto-loading most recent project:', mostRecent.id);
        await loadProjectFromDB(mostRecent.id, headers);
      } else {
        // No projects at all — go to project setup
        useStore.getState().setStep(1);
      }
    } catch (err) {
      console.error('[SiloForge] Failed to load most recent project:', err);
      useStore.getState().setStep(1);
    }
  };

  // Global 401 interceptor: any API call returning 401 should force logout
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        // Check if this is an API route (not the login/me endpoint)
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        if (url.includes('/api/') && !url.includes('/api/auth/login') && !url.includes('/api/auth/me')) {
          // Force logout on 401 from any API call
          logout();
        }
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [logout]);

  // Handle GSC OAuth callback — tokens are returned in URL hash
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || !hash.includes('gsc_access_token')) return;

    const params = new URLSearchParams(hash.replace('#', ''));
    const gscAccessToken = params.get('gsc_access_token');
    const gscError = new URLSearchParams(window.location.search).get('gsc_error');

    if (gscError) {
      console.warn('[GSC-OAuth] Error from Google:', gscError);
      window.history.replaceState({}, '', '/');
      return;
    }

    if (gscAccessToken) {
      sessionStorage.setItem('gsc_access_token', gscAccessToken);
      const refreshToken = params.get('gsc_refresh_token');
      if (refreshToken) {
        sessionStorage.setItem('gsc_refresh_token', refreshToken);
      }
      useStore.getState().setStep(12);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Show loading spinner while Zustand persist is rehydrating
  if (!hydrated) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user || !token) {
    return <LoginPage />;
  }

  // Activate auto-save hook (only when authenticated)
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { currentStep } = useStore();

  // Activate auto-save (3-second debounce when dirty)
  useAutoSave();

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <DashboardAnalytics />;
      case 1:
        return <Step1ProjectSetup />;
      case 2:
        return <Step2SiloStructure />;
      case 3:
        return <Step3SemanticGen />;
      case 4:
        return <Step4PageManagement />;
      case 5:
        return <Step5ExportSave />;
      case 6:
        return <ContentCalendar />;
      case 7:
        return <VisualSiloBuilder />;
      case 8:
        return <InternalLinkingEngine />;
      case 9:
        return <KeywordIntelligence />;
      case 10:
        return <ContentBriefGenerator />;
      case 11:
        return <ArticleGenerator />;
      case 12:
        return <GSCAnalyticsDashboard />;
      case 13:
        return <CompetitorImporter />;
      case 14:
        return <PDFReportExport />;
      case 15:
        return <ContentHumanizer />;
      case 16:
        return <SERPFeatureTracker />;
      case 17:
        return <ContentGapAnalyzer />;
      case 18:
        return <WPAuditor />;
      case 19:
        return <GeoGridTracker />;
      case 20:
        return <GBPManager />;
      case 21:
        return <LocalScanAnalyzer />;
      case 22:
        return <CitationRadar />;
      case 23:
        return <CompetitorCompare />;
      case 99:
        return <AdminPanel />;
      default:
        return <DashboardAnalytics />;
    }
  };

  return (
    <ErrorBoundary>
    <div className="flex h-dvh bg-slate-950 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-6xl mx-auto p-4 md:p-8 pt-16 md:pt-8 pb-20 md:pb-8">
          {renderStep()}
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}
