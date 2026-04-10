'use client';

import { useState, useCallback, useEffect } from 'react';
import { useStore, PageStatus } from '@/store/useStore';
import { calculateSEOScore, getScoreColor, getScoreBgColor } from '@/lib/seo-score';
import PageTypeBadge from './PageTypeBadge';
import {
  Calendar, Clock, FileText, CheckCircle2, Edit3,
  ChevronDown, ChevronRight, GripVertical, ArrowRight,
  Search, Filter,
} from 'lucide-react';

const STATUSES: { key: PageStatus; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { key: 'draft', label: 'Draft', color: 'text-slate-400', bgColor: 'bg-slate-500/20', borderColor: 'border-slate-500/30' },
  { key: 'in_progress', label: 'In Progress', color: 'text-blue-400', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-500/30' },
  { key: 'review', label: 'In Review', color: 'text-amber-400', bgColor: 'bg-amber-500/20', borderColor: 'border-amber-500/30' },
  { key: 'published', label: 'Published', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', borderColor: 'border-emerald-500/30' },
];

export default function ContentCalendar() {
  const { project, silos, pages, updatePage, setStep } = useStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSilo, setFilterSilo] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [movingId, setMovingId] = useState<string | null>(null);

  // Redirect guard
  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  // Filter pages
  const filteredPages = pages.filter(page => {
    const matchesSearch = !search ||
      page.title.toLowerCase().includes(search.toLowerCase()) ||
      page.keywords.some(k => k.toLowerCase().includes(search.toLowerCase()));
    const matchesType = filterType === 'all' || page.type === filterType;
    const matchesSilo = filterSilo === 'all' || page.siloId === filterSilo;
    return matchesSearch && matchesType && matchesSilo;
  });

  // Move page to new status
  const handleStatusChange = useCallback(async (pageId: string, newStatus: PageStatus) => {
    setMovingId(pageId);
    updatePage(pageId, { status: newStatus });

    // Also update in database if saved project exists
    const { savedProjectId, token } = useStore.getState();
    if (savedProjectId && token) {
      try {
        await fetch(`/api/pages/${pageId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        });
      } catch (err) {
        console.error('Failed to update status in DB:', err);
      }
    }

    setTimeout(() => setMovingId(null), 300);
  }, [updatePage]);

  // Status distribution for summary
  const statusCounts = STATUSES.reduce((acc, s) => {
    acc[s.key] = filteredPages.filter(p => (p.status || 'draft') === s.key).length;
    return acc;
  }, {} as Record<PageStatus, number>);

  if (!project) return null;

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Content Calendar</h2>
        <p className="text-sm md:text-base text-slate-400">Track and manage your content pipeline with status boards.</p>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATUSES.map(status => (
          <div
            key={status.key}
            className={`${status.bgColor} border ${status.borderColor} rounded-xl p-3 text-center`}
          >
            <div className={`text-xl font-bold ${status.color}`}>{statusCounts[status.key]}</div>
            <div className="text-slate-400 text-xs">{status.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-6">
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pages..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Types</option>
          <option value="pillar">Pillar</option>
          <option value="cluster">Cluster</option>
          <option value="blog">Blog</option>
          <option value="category">Category</option>
          <option value="landing">Landing</option>
        </select>

        <select
          value={filterSilo}
          onChange={(e) => setFilterSilo(e.target.value)}
          className="px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Silos</option>
          {silos.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'kanban' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUSES.map(status => {
            const statusPages = filteredPages.filter(p => (p.status || 'draft') === status.key);
            return (
              <div key={status.key} className="flex flex-col">
                {/* Column header */}
                <div className={`flex items-center justify-between p-3 rounded-t-xl ${status.bgColor} border ${status.borderColor} border-b-0`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${status.bgColor.replace('/20', '')}`} />
                    <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
                  </div>
                  <span className="text-slate-500 text-xs">{statusPages.length}</span>
                </div>

                {/* Column body */}
                <div className="flex-1 bg-slate-800/50 border border-slate-700 border-t-0 rounded-b-xl p-2 space-y-2 min-h-[200px]">
                  {statusPages.map(page => {
                    const seo = calculateSEOScore(page);
                    const siloName = silos.find(s => s.id === page.siloId)?.name;
                    const isMoving = movingId === page.id;

                    return (
                      <div
                        key={page.id}
                        className={`p-3 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 transition-all cursor-default ${
                          isMoving ? 'opacity-50 scale-95' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <PageTypeBadge type={page.type} />
                          <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getScoreBgColor(seo.grade)}`}>
                            <span className={getScoreColor(seo.grade)}>{seo.grade}</span>
                          </div>
                        </div>

                        <h4 className="text-white text-sm font-medium mb-1 line-clamp-2">{page.title}</h4>
                        <p className="text-slate-500 text-xs mb-2">/{page.slug}</p>

                        {siloName && (
                          <span className="text-[10px] text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded mb-2 inline-block">
                            {siloName}
                          </span>
                        )}

                        {/* Status change buttons */}
                        <div className="flex items-center gap-1 pt-2 border-t border-slate-700/50">
                          {STATUSES.filter(s => s.key !== status.key).map(s => (
                            <button
                              key={s.key}
                              onClick={() => handleStatusChange(page.id, s.key)}
                              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${s.bgColor} ${s.color} hover:opacity-80`}
                              title={`Move to ${s.label}`}
                            >
                              {s.label.length > 8 ? s.label.substring(0, 8) + '.' : s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {statusPages.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-slate-600 text-sm">
                      No pages
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filteredPages.map(page => {
            const seo = calculateSEOScore(page);
            const siloName = silos.find(s => s.id === page.siloId)?.name;
            const pageStatus = (page.status || 'draft') as PageStatus;
            const statusInfo = STATUSES.find(s => s.key === pageStatus) || STATUSES[0];

            return (
              <div
                key={page.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <PageTypeBadge type={page.type} />
                    <span className="text-white font-medium text-sm truncate">{page.title}</span>
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getScoreBgColor(seo.grade)}`}>
                      <span className={getScoreColor(seo.grade)}>{seo.grade}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>/{page.slug}</span>
                    {siloName && <span>- {siloName}</span>}
                    <span>- {page.keywords.length} keywords</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                  {STATUSES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => handleStatusChange(page.id, s.key)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        pageStatus === s.key
                          ? `${s.bgColor} ${s.color} border ${s.borderColor}`
                          : 'bg-slate-700/50 text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredPages.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Calendar size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-lg mb-1">No pages found</p>
              <p className="text-sm">Adjust your filters or add more pages.</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(4)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          Back
        </button>
        <button
          onClick={() => setStep(5)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Export & Save
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
