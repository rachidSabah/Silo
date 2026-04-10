'use client';

import { useStore } from '@/store/useStore';
import type { Project, Silo, Page } from '@/store/useStore';
import PageTypeBadge from './PageTypeBadge';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const siloColors = [
  'border-blue-500',
  'border-emerald-500',
  'border-purple-500',
  'border-orange-500',
  'border-pink-500',
  'border-cyan-500',
  'border-yellow-500',
  'border-red-500',
];

// Desktop tree view component
function DesktopTreeView({ project, silos, pages }: { project: Project; silos: Silo[]; pages: Page[] }) {
  return (
    <div className="hidden md:block bg-slate-800/50 border border-slate-700 rounded-xl p-6 overflow-x-auto">
      <h3 className="text-white font-semibold mb-4 text-lg">Site Architecture</h3>
      <div className="min-w-[600px]">
        {/* Root node */}
        <div className="flex flex-col items-center">
          <div className="px-6 py-3 bg-blue-500/20 border-2 border-blue-500 rounded-xl text-blue-300 font-bold text-center">
            {project.domain}
          </div>
          <div className="w-0.5 h-8 bg-slate-600" />
        </div>

        {/* Silos row */}
        <div className="flex justify-center gap-6">
          {silos.map((silo, index) => {
            const siloPages = pages.filter((p) => p.siloId === silo.id);
            const color = siloColors[index % siloColors.length];

            return (
              <div key={silo.id} className="flex flex-col items-center min-w-[160px]">
                <div className="w-0.5 h-6 bg-slate-600" />
                <div className={`px-4 py-2 bg-slate-700/80 border-2 ${color} rounded-lg text-white font-medium text-center text-sm`}>
                  {silo.name}
                </div>
                <div className="w-0.5 h-4 bg-slate-600" />

                {/* Pages under this silo */}
                <div className="flex flex-col gap-1 w-full">
                  {siloPages.slice(0, 8).map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-md hover:border-slate-500 transition-colors"
                    >
                      <PageTypeBadge type={page.type} size="sm" />
                      <span className="text-gray-300 text-xs truncate">{page.title}</span>
                    </div>
                  ))}
                  {siloPages.length > 8 && (
                    <span className="text-slate-500 text-xs text-center">
                      +{siloPages.length - 8} more pages
                    </span>
                  )}
                  {siloPages.length === 0 && (
                    <span className="text-slate-600 text-xs text-center italic">No pages yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unassigned pages */}
        {pages.filter((p) => !p.siloId).length > 0 && (
          <div className="mt-6 border-t border-slate-700 pt-4">
            <h4 className="text-slate-400 text-sm mb-2">Unassigned Pages</h4>
            <div className="flex flex-wrap gap-2">
              {pages.filter((p) => !p.siloId).map((page) => (
                <div
                  key={page.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-md"
                >
                  <PageTypeBadge type={page.type} size="sm" />
                  <span className="text-gray-300 text-xs">{page.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mobile-friendly list view component
function MobileTreeView({ project, silos, pages }: { project: Project; silos: Silo[]; pages: Page[] }) {
  const [expandedSilos, setExpandedSilos] = useState<Record<string, boolean>>({});

  const toggleSilo = (siloId: string) => {
    setExpandedSilos((prev) => ({ ...prev, [siloId]: prev[siloId] === false }));
  };

  return (
    <div className="md:hidden bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <h3 className="text-white font-semibold mb-4 text-base">Site Architecture</h3>

      {/* Root domain */}
      <div className="px-4 py-2.5 bg-blue-500/20 border-2 border-blue-500 rounded-xl text-blue-300 font-bold text-center text-sm mb-4">
        {project.domain}
      </div>

      {/* Silos as expandable list */}
      <div className="space-y-2">
        {silos.map((silo, index) => {
          const siloPages = pages.filter((p) => p.siloId === silo.id);
          const color = siloColors[index % siloColors.length];
          const isExpanded = expandedSilos[silo.id] !== false;

          return (
            <div key={silo.id} className={`border-2 ${color} rounded-lg overflow-hidden`}>
              <button
                onClick={() => toggleSilo(silo.id)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-700/80"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
                  )}
                  <span className="text-white font-medium text-sm truncate">{silo.name}</span>
                  <span className="px-1.5 py-0.5 bg-slate-600 text-slate-300 rounded text-[10px] flex-shrink-0">
                    {siloPages.length}
                  </span>
                </div>
              </button>

              {isExpanded && siloPages.length > 0 && (
                <div className="p-2 space-y-1 bg-slate-800/50">
                  {siloPages.map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center gap-2 px-2 py-1.5 bg-slate-900/50 rounded-md"
                    >
                      <PageTypeBadge type={page.type} size="sm" />
                      <span className="text-gray-300 text-xs truncate">{page.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && siloPages.length === 0 && (
                <div className="px-3 py-2 text-slate-600 text-xs italic bg-slate-800/50">
                  No pages yet
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unassigned pages */}
      {pages.filter((p) => !p.siloId).length > 0 && (
        <div className="mt-4 border-t border-slate-700 pt-3">
          <h4 className="text-slate-400 text-xs mb-2 uppercase tracking-wider">Unassigned Pages</h4>
          <div className="flex flex-wrap gap-1.5">
            {pages.filter((p) => !p.siloId).map((page) => (
              <div
                key={page.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 border border-slate-600 rounded-md"
              >
                <PageTypeBadge type={page.type} size="sm" />
                <span className="text-gray-300 text-[11px]">{page.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VisualTree() {
  const { project, silos, pages } = useStore();

  if (!project) return null;

  return (
    <>
      <DesktopTreeView project={project} silos={silos} pages={pages} />
      <MobileTreeView project={project} silos={silos} pages={pages} />
    </>
  );
}
