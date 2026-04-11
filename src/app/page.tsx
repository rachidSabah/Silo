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
      case 99:
        return <AdminPanel />;
      default:
        return <DashboardAnalytics />;
    }
  };

  return (
    <div className="flex h-dvh bg-slate-950 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-6xl mx-auto p-4 md:p-8 pt-16 md:pt-8 pb-20 md:pb-8">
          {renderStep()}
        </div>
      </main>
    </div>
  );
}
