'use client';

import { useStore } from '@/store/useStore';
import { Check, Zap } from 'lucide-react';

const steps = [
  { num: 1, label: 'Project Setup' },
  { num: 2, label: 'Silo Structure' },
  { num: 3, label: 'Semantic Gen' },
  { num: 4, label: 'Page Manager' },
  { num: 5, label: 'Export & Save' },
];

export default function Sidebar() {
  const { currentStep, setStep, project, silos, pages } = useStore();

  const isStepAccessible = (step: number): boolean => {
    if (step === 1) return true;
    if (step === 2) return !!project;
    if (step === 3) return !!project && silos.length > 0;
    if (step === 4) return !!project && pages.length > 0;
    if (step === 5) return !!project;
    return false;
  };

  const isStepCompleted = (step: number): boolean => {
    if (step === 1) return !!project;
    if (step === 2) return silos.length > 0;
    if (step === 3) return pages.length > 0;
    return false;
  };

  return (
    <aside className="w-[260px] min-w-[260px] bg-slate-900 border-r border-slate-700 flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">SiloForge</h1>
            <p className="text-[11px] text-slate-500">SEO Architecture Builder</p>
          </div>
        </div>
      </div>

      {/* Step Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {steps.map((step) => {
          const isActive = currentStep === step.num;
          const isCompleted = isStepCompleted(step.num);
          const isAccessible = isStepAccessible(step.num);

          return (
            <button
              key={step.num}
              onClick={() => isAccessible && setStep(step.num)}
              disabled={!isAccessible}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
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
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700/50 text-slate-500'
                }`}
              >
                {isCompleted && !isActive ? <Check size={16} /> : step.num}
              </div>
              <span className="text-sm font-medium">{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer stats */}
      <div className="p-4 border-t border-slate-700">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-800 rounded-lg p-2">
            <div className="text-lg font-bold text-white">{silos.length}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Silos</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-2">
            <div className="text-lg font-bold text-white">{pages.length}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Pages</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-2">
            <div className="text-lg font-bold text-white">
              {pages.filter((p) => p.type === 'pillar').length}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Pillars</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
