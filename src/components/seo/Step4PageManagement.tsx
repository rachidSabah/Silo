'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { v4 as uuidv4 } from 'uuid';
import PageTypeBadge from './PageTypeBadge';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Search,
  Upload,
  Download,
  Edit3,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  LayoutGrid,
} from 'lucide-react';

const PAGE_TYPES = ['pillar', 'cluster', 'blog', 'category', 'landing'] as const;
const PAGE_SIZE = 10;

export default function Step4PageManagement() {
  const { project, silos, pages, addPage, removePage, updatePage, setPages, setStep, token } = useStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ALL hooks must be called before any conditional returns
  // Redirect guard using useEffect
  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  const handleDownloadCSV = useCallback(() => {
    if (!project) return;
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

  // Filter pages
  const filteredPages = pages.filter((page) => {
    const matchesSearch =
      !search ||
      page.title.toLowerCase().includes(search.toLowerCase()) ||
      page.slug.toLowerCase().includes(search.toLowerCase()) ||
      page.keywords.some((k) => k.toLowerCase().includes(search.toLowerCase()));
    const matchesType = filterType === 'all' || page.type === filterType;
    return matchesSearch && matchesType;
  });

  // Pagination
  const totalPages = Math.ceil(filteredPages.length / PAGE_SIZE);
  const paginatedPages = filteredPages.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleEdit = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (page) {
      setEditingId(pageId);
      setEditData({
        title: page.title,
        slug: page.slug,
        metaDescription: page.metaDescription,
        type: page.type,
        siloId: page.siloId || '',
        keywords: page.keywords.join(', '),
      });
    }
  };

  const handleSave = (pageId: string) => {
    const keywords = editData.keywords
      ? editData.keywords.split(',').map((k) => k.trim()).filter(Boolean)
      : [];

    updatePage(pageId, {
      title: editData.title,
      slug: editData.slug,
      metaDescription: editData.metaDescription,
      type: editData.type as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing',
      siloId: editData.siloId || null,
      keywords,
    });
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleAddPage = () => {
    if (!project) return;
    const newPage = {
      id: uuidv4(),
      projectId: project.id,
      siloId: silos.length > 0 ? silos[0].id : null,
      title: 'New Page',
      slug: 'new-page',
      metaDescription: '',
      keywords: [],
      type: 'blog' as const,
      parentId: null,
      status: 'draft' as const,
      content: '',
      wordCount: 0,
    };
    addPage(newPage);
  };

  const handleDeletePage = (id: string) => {
    if (deleteConfirm === id) {
      removePage(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', project.id);

      const importHeaders: Record<string, string> = {};
      if (token) importHeaders['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/import-csv', {
        method: 'POST',
        headers: importHeaders,
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Import request failed');
      }

      const data = await res.json();

      if (data.error) {
        alert(`Import error: ${data.error}`);
        return;
      }

      if (data.errors && data.errors.length > 0) {
        alert(`Import completed with errors:\n${data.errors.slice(0, 5).join('\n')}`);
      }

      if (data.rows && data.rows.length > 0) {
        const newPages = data.rows.map((row: Record<string, string>) => {
          // Match parent_silo name to silo ID
          const parentSiloName = row.parent || row.parent_silo || '';
          const matchedSilo = parentSiloName
            ? silos.find((s) => s.name.toLowerCase() === parentSiloName.toLowerCase())
            : null;

          return {
            id: uuidv4(),
            projectId: project.id,
            siloId: matchedSilo?.id || null,
            title: row.title || 'Untitled',
            slug: row.slug || row.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled',
            metaDescription: row.meta_description || '',
            keywords: row.keywords ? row.keywords.split(';').map((k: string) => k.trim()).filter(Boolean) : [],
            type: (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(row.type)
              ? row.type
              : 'blog') as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing',
            parentId: null,
            status: (['draft', 'in_progress', 'review', 'published'].includes(row.status)
              ? row.status
              : 'draft') as 'draft' | 'in_progress' | 'review' | 'published',
            content: '',
            wordCount: 0,
          };
        });
        setPages([...pages, ...newPages]);
        alert(`Imported ${data.imported || newPages.length} pages successfully!`);
      } else if (!data.errors || data.errors.length === 0) {
        alert('No valid rows found in the CSV file.');
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed. Please check your CSV format.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Card view for each page
  const renderPageCard = (page: typeof pages[0]) => {
    const isEditing = editingId === page.id;
    const siloName = silos.find((s) => s.id === page.siloId)?.name || '';

    if (isEditing) {
      return (
        <div key={page.id} className="p-4 bg-slate-800 border border-blue-500/30 rounded-xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Title</label>
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Slug</label>
              <input
                type="text"
                value={editData.slug}
                onChange={(e) => setEditData({ ...editData, slug: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type</label>
              <select
                value={editData.type}
                onChange={(e) => setEditData({ ...editData, type: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {PAGE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Silo</label>
              <select
                value={editData.siloId}
                onChange={(e) => setEditData({ ...editData, siloId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">None</option>
                {silos.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Meta Description</label>
            <textarea
              value={editData.metaDescription}
              onChange={(e) => setEditData({ ...editData, metaDescription: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Keywords (comma-separated)</label>
            <input
              type="text"
              value={editData.keywords}
              onChange={(e) => setEditData({ ...editData, keywords: e.target.value })}
              placeholder="keyword1, keyword2..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-white text-sm transition-colors"
            >
              <X size={14} />
              Cancel
            </button>
            <button
              onClick={() => handleSave(page.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
            >
              <Check size={14} />
              Save
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={page.id}
        className="p-3 md:p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-slate-600 transition-all"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <PageTypeBadge type={page.type} />
            <h4 className="text-white font-medium text-sm truncate">{page.title}</h4>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => handleEdit(page.id)}
              className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"
              title="Edit page"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => handleDeletePage(page.id)}
              className={`p-1.5 rounded transition-all ${
                deleteConfirm === page.id
                  ? 'text-red-400 bg-red-500/20'
                  : 'text-slate-400 hover:text-red-400'
              }`}
              title={deleteConfirm === page.id ? 'Click again to confirm deletion' : 'Delete page'}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="text-slate-500 text-xs mb-2">/{page.slug}</div>
        {page.metaDescription && (
          <p className="text-slate-400 text-xs mb-2 line-clamp-2">{page.metaDescription}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {page.keywords.slice(0, 3).map((kw, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-slate-700/50 text-slate-300 rounded text-[10px]">
                {kw}
              </span>
            ))}
            {page.keywords.length > 3 && (
              <span className="text-slate-500 text-[10px]">+{page.keywords.length - 3}</span>
            )}
          </div>
          {siloName && (
            <span className="text-[10px] text-slate-500 flex-shrink-0">{siloName}</span>
          )}
        </div>
        {deleteConfirm === page.id && (
          <p className="text-red-400 text-xs mt-2 animate-pulse">Click delete again to confirm</p>
        )}
      </div>
    );
  };

  // Conditional return AFTER all hooks
  if (!project) return null;

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Page Management</h2>
        <p className="text-sm md:text-base text-slate-400">Edit, add, and manage all your pages. Import or export as CSV.</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search pages..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Types</option>
          {PAGE_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        {/* View mode toggle - hidden on small screens */}
        <div className="hidden md:flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('cards')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'cards' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
            title="Card view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'table' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
            title="Table view"
          >
            <LayoutList size={14} />
          </button>
        </div>

        {/* Action buttons */}
        <button
          onClick={handleAddPage}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Add Page</span>
          <span className="sm:hidden">Add</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
        >
          <Upload size={14} />
          <span className="hidden sm:inline">{importing ? 'Importing...' : 'Upload CSV'}</span>
          <span className="sm:hidden">{importing ? '...' : 'CSV'}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleImportCSV}
          className="hidden"
        />

        <button
          onClick={handleDownloadCSV}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Download CSV</span>
          <span className="sm:hidden">Export</span>
        </button>
      </div>

      {/* Content - Cards view (default, always used on mobile) */}
      <div className={viewMode === 'cards' ? 'block' : 'hidden md:block'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {paginatedPages.map((page) => renderPageCard(page))}
        </div>

        {filteredPages.length === 0 && (
          <div className="text-center py-12 md:py-16 text-slate-500">
            <p className="text-lg mb-2">No pages found</p>
            <p className="text-sm">Add pages or adjust your search filters.</p>
          </div>
        )}
      </div>

      {/* Content - Table view (desktop only) */}
      <div className={`bg-slate-800 border border-slate-700 rounded-xl overflow-hidden ${viewMode === 'table' ? 'block' : 'hidden md:hidden'}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">Meta Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Silo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">Keywords</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {paginatedPages.map((page) => {
                const isEditing = editingId === page.id;

                return (
                  <tr key={page.id} className="hover:bg-slate-750 transition-colors">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editData.type}
                          onChange={(e) => setEditData({ ...editData, type: e.target.value })}
                          className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-xs focus:outline-none"
                        >
                          {PAGE_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      ) : (
                        <PageTypeBadge type={page.type} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editData.title}
                          onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none"
                        />
                      ) : (
                        <span className="text-white text-sm">{page.title}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editData.slug}
                          onChange={(e) => setEditData({ ...editData, slug: e.target.value })}
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none"
                        />
                      ) : (
                        <span className="text-slate-400 text-sm">/{page.slug}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editData.metaDescription}
                          onChange={(e) => setEditData({ ...editData, metaDescription: e.target.value })}
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none"
                        />
                      ) : (
                        <span className="text-slate-400 text-sm truncate max-w-[200px] block">
                          {page.metaDescription || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editData.siloId}
                          onChange={(e) => setEditData({ ...editData, siloId: e.target.value })}
                          className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-xs focus:outline-none"
                        >
                          <option value="">None</option>
                          {silos.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400 text-sm">
                          {silos.find((s) => s.id === page.siloId)?.name || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editData.keywords}
                          onChange={(e) => setEditData({ ...editData, keywords: e.target.value })}
                          placeholder="kw1, kw2"
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-xs focus:outline-none"
                        />
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {page.keywords.slice(0, 2).map((kw, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-[10px]">
                              {kw}
                            </span>
                          ))}
                          {page.keywords.length > 2 && (
                            <span className="text-slate-500 text-[10px]">+{page.keywords.length - 2}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleSave(page.id)}
                            className="p-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="p-1.5 text-slate-400 hover:text-white transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(page.id)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletePage(page.id)}
                            className={`p-1.5 rounded transition-all ${
                              deleteConfirm === page.id
                                ? 'text-red-400 bg-red-500/20'
                                : 'text-slate-400 hover:text-red-400'
                            }`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredPages.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <p className="text-lg mb-2">No pages found</p>
            <p className="text-sm">Add pages or adjust your search filters.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <span className="text-sm text-slate-400">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredPages.length)} of {filteredPages.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === p
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(3)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={() => setStep(5)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Next: Export & Save
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
