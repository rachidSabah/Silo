'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { v4 as uuidv4 } from 'uuid';
import TagInput from './TagInput';
import { Globe, Tag, FileText, Languages, ArrowRight, Sparkles } from 'lucide-react';

export default function Step1ProjectSetup() {
  const { project, setProject, setStep, setSilos, setPages, setSavedProjectId } = useStore();
  const [name, setName] = useState(project?.name || '');
  const [domain, setDomain] = useState(project?.domain || '');
  const [language, setLanguage] = useState(project?.language || 'en');
  const [niche, setNiche] = useState(project?.niche || '');
  const [seedKeywords, setSeedKeywords] = useState<string[]>(project?.seedKeywords || []);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState('');

  const handleExpandKeywords = async () => {
    if (seedKeywords.length === 0 && !niche) return;
    setExpanding(true);
    setError('');
    try {
      const res = await fetch('/api/ai/expand-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedKeywords: seedKeywords.length > 0 ? seedKeywords : [niche],
          niche,
          language,
        }),
      });
      const data = await res.json();
      if (data.keywords) {
        const newKeywords = [...new Set([...seedKeywords, ...data.keywords])];
        setSeedKeywords(newKeywords);
      }
    } catch (err) {
      setError('Failed to expand keywords. Please try again.');
      console.error(err);
    } finally {
      setExpanding(false);
    }
  };

  const handleNext = () => {
    if (!name.trim() || !domain.trim()) {
      setError('Project name and domain are required.');
      return;
    }

    const projectId = project?.id || uuidv4();
    setProject({
      id: projectId,
      name: name.trim(),
      domain: domain.trim().replace(/^https?:\/\//, ''),
      language,
      niche: niche.trim(),
      seedKeywords,
    });

    setSavedProjectId(null);
    setSilos([]);
    setPages([]);
    setStep(2);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Project Setup</h2>
        <p className="text-slate-400">Define your website project details and seed keywords to get started.</p>
      </div>

      <div className="space-y-6">
        {/* Project Name */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <FileText size={16} />
            Project Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., My Fitness Blog"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        {/* Domain */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <Globe size={16} />
            Domain Name
          </label>
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
            <span className="px-4 py-3 text-slate-500 bg-slate-800 border-r border-slate-700 text-sm whitespace-nowrap">
              https://
            </span>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="flex-1 px-4 py-3 bg-transparent text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <Languages size={16} />
            Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          >
            <option value="en">English (EN)</option>
            <option value="fr">French (FR)</option>
            <option value="es">Spanish (ES)</option>
            <option value="de">German (DE)</option>
            <option value="it">Italian (IT)</option>
            <option value="pt">Portuguese (PT)</option>
          </select>
        </div>

        {/* Niche */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <Tag size={16} />
            Main Niche / Topic
          </label>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="e.g., Fitness & Health, Digital Marketing, Travel"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        {/* Seed Keywords */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
            <Sparkles size={16} />
            Seed Keywords
          </label>
          <TagInput
            tags={seedKeywords}
            onChange={setSeedKeywords}
            placeholder="Type a keyword and press Enter..."
          />
          <p className="text-slate-500 text-xs mt-2">
            Add your main target keywords. Press Enter or comma to add each keyword.
          </p>

          <button
            onClick={handleExpandKeywords}
            disabled={expanding || (seedKeywords.length === 0 && !niche)}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {expanding ? (
              <>
                <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                Expanding keywords...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Expand with AI
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Next Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleNext}
            disabled={!name.trim() || !domain.trim()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
          >
            Next: Silo Structure
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
