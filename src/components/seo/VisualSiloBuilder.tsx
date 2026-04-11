'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useStore, type Silo, type Page } from '@/store/useStore';
import {
  calculateSiloHealth,
  getHealthColor,
  getHealthBgColor,
  getHealthDot,
  detectCannibalization,
  type SiloHealthResult,
} from '@/lib/silo-health';
import PageTypeBadge from './PageTypeBadge';
import MindMapCanvas from './MindMapCanvas';
import {
  Network, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  GripVertical, Plus, Trash2, AlertCircle, Link2, Shield, Eye,
  ArrowRight, Search, RefreshCw,
} from 'lucide-react';

const siloColors = [
  { border: 'border-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-300', dot: 'bg-blue-500', ring: 'ring-blue-500/30' },
  { border: 'border-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-500', ring: 'ring-emerald-500/30' },
  { border: 'border-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-300', dot: 'bg-purple-500', ring: 'ring-purple-500/30' },
  { border: 'border-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-500', ring: 'ring-orange-500/30' },
  { border: 'border-pink-500', bg: 'bg-pink-500/20', text: 'text-pink-300', dot: 'bg-pink-500', ring: 'ring-pink-500/30' },
  { border: 'border-cyan-500', bg: 'bg-cyan-500/20', text: 'text-cyan-300', dot: 'bg-cyan-500', ring: 'ring-cyan-500/30' },
  { border: 'border-yellow-500', bg: 'bg-yellow-500/20', text: 'text-yellow-300', dot: 'bg-yellow-500', ring: 'ring-yellow-500/30' },
  { border: 'border-rose-500', bg: 'bg-rose-500/20', text: 'text-rose-300', dot: 'bg-rose-500', ring: 'ring-rose-500/30' },
];

export default function VisualSiloBuilder() {
  const { project, silos, pages, internalLinks, removeSilo, removePage, updatePage, setStep } = useStore();
  const [expandedSilo, setExpandedSilo] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [dragOverSilo, setDragOverSilo] = useState<string | null>(null);
  const [healthResults, setHealthResults] = useState<SiloHealthResult[]>([]);
  const [showOrphaned, setShowOrphaned] = useState(true);
  const [showBleedAlerts, setShowBleedAlerts] = useState(true);
  const [filterHealth, setFilterHealth] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'mindmap'>('list');

  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  // Calculate health for each silo using useMemo to avoid set-state-in-effect
  const computedHealthResults = useMemo(() =>
    silos.map(silo =>
      calculateSiloHealth(silo, pages, internalLinks.map(l => ({
        fromPageId: l.fromPageId,
        toPageId: l.toPageId,
        anchor: l.anchor,
      })))
    ),
    [silos, pages, internalLinks]
  );

  // Keep state in sync for components that need it
  useEffect(() => {
    setHealthResults(computedHealthResults);
  }, [computedHealthResults]);

  // Orphaned pages (not assigned to any silo)
  const orphanedPages = pages.filter(p => !p.siloId);

  // Bleed alerts from all silos
  const allBleedAlerts = healthResults.flatMap(hr => hr.bleedLinks);

  // Cannibalization per silo
  const cannibalization = useMemo(() => {
    const map: Record<string, Array<{ keyword: string; pages: Array<{ id: string; title: string }> }>> = {};
    for (const silo of silos) {
      map[silo.id] = detectCannibalization(pages, silo.id);
    }
    return map;
  }, [silos, pages]);

  // Drag and drop handlers
  const handleDragStart = (pageId: string) => {
    setDraggedPage(pageId);
  };

  const handleDragOver = (e: React.DragEvent, siloId: string) => {
    e.preventDefault();
    setDragOverSilo(siloId);
  };

  const handleDragLeave = () => {
    setDragOverSilo(null);
  };

  const handleDrop = (siloId: string) => {
    if (draggedPage) {
      updatePage(draggedPage, { siloId });
      setDraggedPage(null);
      setDragOverSilo(null);
    }
  };

  // Filter silos by health
  const filteredSilos = filterHealth === 'all'
    ? silos
    : silos.filter(s => {
        const hr = healthResults.find(h => h.siloId === s.id);
        return hr?.grade === filterHealth;
      });

  if (!project) return null;

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Network size={24} className="text-blue-400" />
          Visual Silo Builder
        </h2>
        <p className="text-sm md:text-base text-slate-400">
          Drag pages between silos, monitor health scores, and detect structural issues in your site architecture.
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-400">
            {healthResults.filter(h => h.grade === 'healthy').length}
          </div>
          <div className="text-slate-400 text-xs">Healthy Silos</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-yellow-400">
            {healthResults.filter(h => h.grade === 'warning').length}
          </div>
          <div className="text-slate-400 text-xs">Warning</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-red-400">
            {healthResults.filter(h => h.grade === 'critical').length}
          </div>
          <div className="text-slate-400 text-xs">Critical</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-slate-300">{orphanedPages.length}</div>
          <div className="text-slate-400 text-xs">Orphaned Pages</div>
        </div>
      </div>

      {/* Alerts Section */}
      {(allBleedAlerts.length > 0 || orphanedPages.length > 0) && (
        <div className="mb-6 space-y-3">
          {/* Bleed Alerts */}
          {showBleedAlerts && allBleedAlerts.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-red-300 font-semibold text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  Silo Bleed Alerts ({allBleedAlerts.length})
                </h3>
                <button onClick={() => setShowBleedAlerts(false)} className="text-red-400 hover:text-red-300">
                  <XCircle size={16} />
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allBleedAlerts.slice(0, 10).map((bleed, i) => {
                  const fromSilo = silos.find(s => s.id === bleed.fromSiloId);
                  const toSilo = silos.find(s => s.id === bleed.toSiloId);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 bg-red-500/5 rounded-lg">
                      <span className="text-slate-300 truncate max-w-[120px]">{bleed.fromPageTitle}</span>
                      <ArrowRight size={12} className="text-red-400 flex-shrink-0" />
                      <span className="text-red-300 truncate max-w-[80px]">&quot;{bleed.anchor}&quot;</span>
                      <ArrowRight size={12} className="text-red-400 flex-shrink-0" />
                      <span className="text-slate-300 truncate max-w-[120px]">{bleed.toPageTitle}</span>
                      <span className="text-red-400 flex-shrink-0 ml-auto">
                        {fromSilo?.name} → {toSilo?.name}
                      </span>
                    </div>
                  );
                })}
                {allBleedAlerts.length > 10 && (
                  <p className="text-slate-500 text-xs text-center">+{allBleedAlerts.length - 10} more bleed links</p>
                )}
              </div>
            </div>
          )}

          {/* Orphaned Pages */}
          {showOrphaned && orphanedPages.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-yellow-300 font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Orphaned Pages ({orphanedPages.length})
                </h3>
                <button onClick={() => setShowOrphaned(false)} className="text-yellow-400 hover:text-yellow-300">
                  <XCircle size={16} />
                </button>
              </div>
              <p className="text-slate-400 text-xs mb-3">
                These pages are not assigned to any silo. Drag them into a silo to fix.
              </p>
              <div className="flex flex-wrap gap-2">
                {orphanedPages.map(page => (
                  <div
                    key={page.id}
                    draggable
                    onDragStart={() => handleDragStart(page.id)}
                    className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 border border-yellow-500/30 rounded-lg cursor-grab hover:border-yellow-400 transition-colors"
                  >
                    <GripVertical size={12} className="text-slate-500" />
                    <PageTypeBadge type={page.type} size="sm" />
                    <span className="text-slate-300 text-xs">{page.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Health Filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-slate-400 text-xs">Filter:</span>
        {['all', 'healthy', 'warning', 'critical'].map(filter => (
          <button
            key={filter}
            onClick={() => setFilterHealth(filter)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterHealth === filter
                ? filter === 'healthy' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : filter === 'warning' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                  : filter === 'critical' ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
            }`}
          >
            {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}

        <div className="flex-1" />

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('mindmap')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'mindmap' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mind Map
          </button>
        </div>
      </div>

      {/* Mind Map View */}
      {viewMode === 'mindmap' && <MindMapCanvas />}

      {/* Interactive Silo Map (List View) */}
      {viewMode === 'list' && (
      <div className="space-y-4">
        {filteredSilos.map((silo, index) => {
          const color = siloColors[index % siloColors.length];
          const health = healthResults.find(h => h.siloId === silo.id);
          const siloPages = pages.filter(p => p.siloId === silo.id);
          const isExpanded = expandedSilo === silo.id;
          const isDragOver = dragOverSilo === silo.id;
          const cannibalizationIssues = cannibalization[silo.id] || [];

          return (
            <div
              key={silo.id}
              className={`rounded-xl border-2 transition-all duration-200 ${
                isDragOver ? `${color.border} ${color.bg} scale-[1.01]` : `${color.border} border-opacity-50`
              }`}
              onDragOver={(e) => handleDragOver(e, silo.id)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(silo.id)}
            >
              {/* Silo Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/50 rounded-t-xl"
                onClick={() => setExpandedSilo(isExpanded ? null : silo.id)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  <div className={`w-3 h-3 rounded-full ${color.dot}`} />
                  <h3 className={`font-semibold ${color.text}`}>{silo.name}</h3>
                  <span className="text-slate-500 text-xs">{siloPages.length} pages</span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Health Score Badge */}
                  {health && (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${getHealthBgColor(health.grade)}`}>
                      <div className={`w-2 h-2 rounded-full ${getHealthDot(health.grade)}`} />
                      <span className={`text-xs font-bold ${getHealthColor(health.grade)}`}>{health.score}</span>
                    </div>
                  )}

                  {/* Cannibalization Warning */}
                  {cannibalizationIssues.length > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                      <AlertTriangle size={12} className="text-orange-400" />
                      <span className="text-orange-300 text-[10px] font-medium">{cannibalizationIssues.length}</span>
                    </div>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); removeSilo(silo.id); }}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Silo Content (Expanded) */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  {/* Health Details */}
                  {health && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                      <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                        <div className="text-blue-400 font-bold text-sm">{health.pillarCount}</div>
                        <div className="text-slate-500 text-[10px]">Pillars</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                        <div className="text-purple-400 font-bold text-sm">{health.clusterCount}</div>
                        <div className="text-slate-500 text-[10px]">Clusters</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                        <div className="text-amber-400 font-bold text-sm">{health.blogCount}</div>
                        <div className="text-slate-500 text-[10px]">Blogs</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                        <div className="text-slate-300 font-bold text-sm">{health.orphanedPages.length}</div>
                        <div className="text-slate-500 text-[10px]">Unlinked</div>
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {health && health.issues.length > 0 && (
                    <div className="mb-4 space-y-1">
                      {health.issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <AlertCircle size={12} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                          <span className="text-slate-300">{issue}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Suggestions */}
                  {health && health.suggestions.length > 0 && (
                    <div className="mb-4 space-y-1">
                      {health.suggestions.slice(0, 3).map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <CheckCircle2 size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
                          <span className="text-slate-400">{s}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cannibalization Issues */}
                  {cannibalizationIssues.length > 0 && (
                    <div className="mb-4 bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
                      <h4 className="text-orange-300 text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={12} />
                        Keyword Cannibalization
                      </h4>
                      {cannibalizationIssues.map((issue, i) => (
                        <div key={i} className="text-xs mb-1">
                          <span className="text-orange-300 font-medium">&quot;{issue.keyword}&quot;</span>
                          <span className="text-slate-400"> used by: </span>
                          {issue.pages.map((p, j) => (
                            <span key={j} className="text-slate-300">{p.title}{j < issue.pages.length - 1 ? ', ' : ''}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pages in this Silo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {siloPages.map(page => {
                      const isDragging = draggedPage === page.id;
                      return (
                        <div
                          key={page.id}
                          draggable
                          onDragStart={() => handleDragStart(page.id)}
                          className={`flex items-center gap-2 p-2.5 bg-slate-800 border border-slate-700 rounded-lg cursor-grab hover:border-slate-500 transition-all ${
                            isDragging ? 'opacity-50' : ''
                          } ${selectedPage === page.id ? 'ring-2 ring-blue-500' : ''}`}
                          onClick={() => setSelectedPage(selectedPage === page.id ? null : page.id)}
                        >
                          <GripVertical size={12} className="text-slate-600 flex-shrink-0" />
                          <PageTypeBadge type={page.type} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-xs font-medium truncate">{page.title}</div>
                            <div className="text-slate-500 text-[10px]">/{page.slug}</div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); removePage(page.id); }}
                            className="p-1 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {siloPages.length === 0 && (
                    <div className="text-center py-6 text-slate-500 text-sm border-2 border-dashed border-slate-700 rounded-lg">
                      <p>Drag pages here to add them to this silo</p>
                    </div>
                  )}

                  {/* Drop zone indicator */}
                  {isDragOver && (
                    <div className="mt-2 p-3 border-2 border-dashed border-blue-500 rounded-lg bg-blue-500/10 text-center">
                      <p className="text-blue-300 text-sm">Drop page here to assign to this silo</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredSilos.length === 0 && silos.length > 0 && (
          <div className="text-center py-8 text-slate-500">
            <Network size={32} className="mx-auto mb-2 opacity-30" />
            <p>No silos match the selected health filter.</p>
          </div>
        )}

        {silos.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Network size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg mb-2">No Silos Created</p>
            <p className="text-sm mb-4">Go to Silo Structure to create your first silo.</p>
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
            >
              Create Silos
            </button>
          </div>
        )}
      </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(2)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          Back to Silo Structure
        </button>
        <button
          onClick={() => setStep(8)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Internal Linking
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
