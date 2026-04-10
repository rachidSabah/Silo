'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Check, Zap, Menu, X } from 'lucide-react';

const steps = [
  { num: 1, label: 'Project Setup' },
  { num: 2, label: 'Silo Structure' },
  { num: 3, label: 'Semantic Gen' },
  { num: 4, label: 'Page Manager' },
  { num: 5, label: 'Export & Save' },
];

export default function Sidebar() {
  const { currentStep, setStep, project, silos, pages } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isStepAccessible = (step: number): boolean => {
    if (step === 1) return true;
    if (step === 2) return !!project;
    if (step === 3) return !!project && silos.length > 0;
    if (step === 4) return !!project && pages.length > 0;
    if (step === 5) return !!project && pages.length > 0;
    return false;
  };

  const isStepCompleted = (step: number): boolean => {
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

  // Close mobile sidebar when step changes (handled in handleStepClick)

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 md:p-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">SiloForge</h1>
            <p className="text-[10px] md:text-[11px] text-slate-500">SEO Architecture Builder</p>
          </div>
        </div>
      </div>

      {/* Step Navigation */}
      <nav className="flex-1 p-3 md:p-4 space-y-1 overflow-y-auto">
        {steps.map((step) => {
          const isActive = currentStep === step.num;
          const isCompleted = isStepCompleted(step.num);
          const isAccessible = isStepAccessible(step.num);

          return (
            <button
              key={step.num}
              onClick={() => handleStepClick(step.num)}
              disabled={!isAccessible}
              className={`w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl text-left transition-all duration-200 ${
                isActive
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-lg shadow-blue-500/5'
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
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700/50 text-slate-500'
                }`}
              >
                {isCompleted && !isActive ? <Check size={14} /> : step.num}
              </div>
              <span className="text-xs md:text-sm font-medium">{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer stats */}
      <div className="p-3 md:p-4 border-t border-slate-700">
        <div className="grid grid-cols-3 gap-1.5 md:gap-2 text-center">
          <div className="bg-slate-800 rounded-lg p-1.5 md:p-2">
            <div className="text-base md:text-lg font-bold text-white">{silos.length}</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Silos</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-1.5 md:p-2">
            <div className="text-base md:text-lg font-bold text-white">{pages.length}</div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Pages</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-1.5 md:p-2">
            <div className="text-base md:text-lg font-bold text-white">
              {pages.filter((p) => p.type === 'pillar').length}
            </div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider">Pillars</div>
          </div>
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
      <aside className="hidden md:flex w-[260px] min-w-[260px] bg-slate-900 border-r border-slate-700 flex-col h-full">
        {sidebarContent}
      </aside>
    </>
  );
}
