'use client';

import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
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

export default function Home() {
  const { currentStep, user, token, setUser, setToken } = useStore();

  // Verify token on mount
  useEffect(() => {
    if (token && user) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) {
            setUser(null);
            setToken(null);
          }
          return res.json();
        })
        .then((data) => {
          if (data.user) setUser(data.user);
        })
        .catch(() => {
          // Token invalid, clear auth
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show login if not authenticated
  if (!user || !token) {
    return <LoginPage />;
  }

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
