'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { v4 as uuidv4 } from 'uuid';
import TagInput from './TagInput';
import VisualTree from './VisualTree';
import { Sparkles, Plus, X, ArrowLeft, ArrowRight, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

export default function Step2SiloStructure() {
  const { project, silos, setSilos, addSilo, removeSilo, updateSilo, setStep, token } = useStore();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'tree'>('edit');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedSilo, setExpandedSilo] = useState<string | null>(null);

  // Redirect guard using useEffect instead of render-time setStep
  useEffect(() => {
    if (!project) setStep(1);
  }, [project, setStep]);

  if (!project) return null;

  const handleGenerateSilos = async () => {
    setGenerating(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/generate-silos', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          niche: project.niche,
          keywords: project.seedKeywords,
          language: project.language,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate silos');
      }
      const data = await res.json();

      if (data.silos && Array.isArray(data.silos)) {
        const newSilos = data.silos.map((s: { name: string; keywords?: string[] }) => ({
          id: uuidv4(),
          projectId: project.id,
          name: s.name,
          keywords: s.keywords || [],
        }));
        setSilos(newSilos);
        // Auto-expand first silo
        if (newSilos.length > 0) setExpandedSilo(newSilos[0].id);
      } else {
        setError('AI returned unexpected format. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate silos. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddManualSilo = () => {
    const newSilo = {
      id: uuidv4(),
      projectId: project.id,
      name: 'New Silo',
      keywords: [],
    };
    addSilo(newSilo);
    setExpandedSilo(newSilo.id);
  };

  const handleRemoveSilo = (id: string) => {
    if (deleteConfirm === id) {
      removeSilo(id);
      setDeleteConfirm(null);
      if (expandedSilo === id) setExpandedSilo(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedSilo(expandedSilo === id ? null : id);
  };

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Silo Structure</h2>
        <p className="text-sm md:text-base text-slate-400">Define your content silo categories. Use AI to generate suggestions or add them manually.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('edit')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'edit'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Edit Silos
        </button>
        <button
          onClick={() => setActiveTab('tree')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'tree'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          Tree View
        </button>
      </div>

      {activeTab === 'edit' ? (
        <>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={handleGenerateSilos}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Silos with AI
                </>
              )}
            </button>
            <button
              onClick={handleAddManualSilo}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
            >
              <Plus size={16} />
              Add Silo Manually
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Generating indicator */}
          {generating && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 size={20} className="animate-spin text-blue-400" />
                <span className="text-blue-300 font-medium text-sm">AI is generating silo structure...</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}

          {/* Silo cards - list view for better mobile */}
          <div className="space-y-3">
            {silos.map((silo) => {
              const isExpanded = expandedSilo === silo.id;

              return (
                <div
                  key={silo.id}
                  className="group bg-slate-800 border border-slate-700 rounded-xl hover:border-slate-600 transition-all overflow-hidden"
                >
                  {/* Silo header */}
                  <div className="flex items-center gap-2 p-3 md:p-4">
                    <button
                      onClick={() => toggleExpand(silo.id)}
                      className="p-1 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <input
                      type="text"
                      value={silo.name}
                      onChange={(e) => updateSilo(silo.id, { name: e.target.value })}
                      className="flex-1 min-w-0 bg-transparent text-white font-medium text-base md:text-lg focus:outline-none border-b border-transparent focus:border-blue-500 transition-colors"
                      maxLength={100}
                    />
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:inline px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded text-xs">
                        {silo.keywords?.length || 0} keywords
                      </span>
                      <button
                        onClick={() => handleRemoveSilo(silo.id)}
                        className={`p-1.5 rounded-lg transition-all ${
                          deleteConfirm === silo.id
                            ? 'text-red-400 bg-red-500/20 border border-red-500/30'
                            : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                        }`}
                        title={deleteConfirm === silo.id ? 'Click again to confirm' : 'Delete silo'}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Delete confirmation */}
                  {deleteConfirm === silo.id && (
                    <div className="px-3 md:px-4 pb-2">
                      <p className="text-red-400 text-xs">Click X again to confirm deletion</p>
                    </div>
                  )}

                  {/* Expanded content - keyword editing */}
                  {isExpanded && (
                    <div className="px-3 md:px-4 pb-3 md:pb-4 border-t border-slate-700/50 pt-3">
                      <label className="text-xs font-medium text-slate-400 mb-2 block">Silo Keywords</label>
                      <TagInput
                        tags={silo.keywords || []}
                        onChange={(keywords) => updateSilo(silo.id, { keywords })}
                        placeholder="Type a keyword and press Enter..."
                        maxTags={20}
                      />
                      <div className="flex items-center gap-2 mt-2 text-slate-500 text-xs">
                        <span className="sm:hidden">{silo.keywords?.length || 0} keywords</span>
                        <span className="hidden sm:inline">Add keywords to help AI generate relevant pages for this silo</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {silos.length === 0 && !generating && (
              <div className="text-center py-12 md:py-16 text-slate-500">
                <Sparkles size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg mb-2">No silos yet</p>
                <p className="text-sm">Generate silos with AI or add them manually to get started.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <VisualTree />
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 md:pt-8 mt-6 md:mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(1)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          disabled={silos.length === 0}
          className="flex items-center gap-2 px-4 md:px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20 text-sm"
        >
          Next: Semantic Gen
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
