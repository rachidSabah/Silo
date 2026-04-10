'use client';

import { useState, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { v4 as uuidv4 } from 'uuid';
import PageTypeBadge from './PageTypeBadge';
import TagInput from './TagInput';
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
} from 'lucide-react';

const PAGE_TYPES = ['pillar', 'cluster', 'blog', 'category', 'landing'] as const;
const PAGE_SIZE = 10;

export default function Step4PageManagement() {
  const { project, silos, pages, addPage, removePage, updatePage, setPages, setStep } = useStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  if (!project) {
    setStep(1);
    return null;
  }

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
    };
    addPage(newPage);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.errors && data.errors.length > 0) {
        alert(`Import completed with errors:\n${data.errors.slice(0, 5).join('\n')}`);
      }

      if (data.rows && data.rows.length > 0) {
        const newPages = data.rows.map((row: Record<string, string>) => ({
          id: uuidv4(),
          projectId: project.id,
          siloId: '',
          title: row.title || 'Untitled',
          slug: row.slug || 'untitled',
          metaDescription: row.meta_description || '',
          keywords: row.keywords ? row.keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [],
          type: (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(row.type)
            ? row.type
            : 'blog') as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing',
          parentId: null,
        }));
        setPages([...pages, ...newPages]);
        alert(`Imported ${newPages.length} pages successfully!`);
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed. Please check your CSV format.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Page Management</h2>
        <p className="text-slate-400">Edit, add, and manage all your pages. Import or export as CSV.</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
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

        {/* Action buttons */}
        <button
          onClick={handleAddPage}
          className="flex items-center gap-2 px-3 py-2.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
        >
          <Plus size={14} />
          Add Page
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-2 px-3 py-2.5 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
        >
          <Upload size={14} />
          {importing ? 'Importing...' : 'Upload CSV'}
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
          className="flex items-center gap-2 px-3 py-2.5 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
        >
          <Download size={14} />
          Download CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Meta Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Silo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Keywords</th>
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
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
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
                            onClick={() => removePage(page.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
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
        <div className="flex items-center justify-between mt-4">
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {page}
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
      <div className="flex justify-between pt-8 mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(3)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={() => setStep(5)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
        >
          Next: Export & Save
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
