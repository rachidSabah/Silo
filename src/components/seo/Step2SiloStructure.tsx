'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { v4 as uuidv4 } from 'uuid';
import VisualTree from './VisualTree';
import { Sparkles, Plus, X, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

export default function Step2SiloStructure() {
  const { project, silos, setSilos, addSilo, removeSilo, updateSilo, setStep } = useStore();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'tree'>('edit');

  if (!project) {
    setStep(1);
    return null;
  }

  const handleGenerateSilos = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/ai/generate-silos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: project.niche,
          keywords: project.seedKeywords,
          language: project.language,
        }),
      });
      const data = await res.json();

      if (data.silos && Array.isArray(data.silos)) {
        const newSilos = data.silos.map((s: { name: string; keywords?: string[] }) => ({
          id: uuidv4(),
          projectId: project.id,
          name: s.name,
          keywords: s.keywords || [],
        }));
        setSilos(newSilos);
      } else {
        setError('AI returned unexpected format. Please try again.');
      }
    } catch (err) {
      setError('Failed to generate silos. Please try again.');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleAddManualSilo = () => {
    addSilo({
      id: uuidv4(),
      projectId: project.id,
      name: 'New Silo',
      keywords: [],
    });
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Silo Structure</h2>
        <p className="text-slate-400">Define your content silo categories. Use AI to generate suggestions or add them manually.</p>
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
          <div className="flex gap-3 mb-6">
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

          {/* Silo cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {silos.map((silo) => (
              <div
                key={silo.id}
                className="group p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-slate-600 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <input
                    type="text"
                    value={silo.name}
                    onChange={(e) => updateSilo(silo.id, { name: e.target.value })}
                    className="flex-1 bg-transparent text-white font-medium text-lg focus:outline-none border-b border-transparent focus:border-blue-500 transition-colors mr-2"
                  />
                  <button
                    onClick={() => removeSilo(silo.id)}
                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded text-xs">
                    {silo.keywords?.length || 0} keywords
                  </span>
                  <span className="text-slate-600 text-xs">·</span>
                  <span className="text-slate-500 text-xs">
                    {silo.name.toLowerCase().replace(/\s+/g, '-')}
                  </span>
                </div>
              </div>
            ))}

            {silos.length === 0 && (
              <div className="col-span-2 text-center py-16 text-slate-500">
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
      <div className="flex justify-between pt-8 mt-8 border-t border-slate-700">
        <button
          onClick={() => setStep(1)}
          className="flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          disabled={silos.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
        >
          Next: Semantic Generation
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
