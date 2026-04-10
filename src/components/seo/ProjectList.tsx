'use client';

import { useEffect, useState } from 'react';
import { Trash2, FolderOpen } from 'lucide-react';
import { useStore } from '@/store/useStore';

interface SavedProject {
  id: string;
  name: string;
  domain: string;
  language: string;
  niche: string | null;
  seed_keywords: string | null;
  created_at: string;
}

export default function ProjectList() {
  const { setProject, setSilos, setPages, setStep, setSavedProjectId, resetStore } = useStore();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadProject = async (project: SavedProject) => {
    try {
      // Load silos
      const silosRes = await fetch(`/api/silos?project_id=${project.id}`);
      const silosData = await silosRes.json();

      // Load pages
      const pagesRes = await fetch(`/api/pages?project_id=${project.id}`);
      const pagesData = await pagesRes.json();

      setProject({
        id: project.id,
        name: project.name,
        domain: project.domain,
        language: project.language || 'en',
        niche: project.niche || '',
        seedKeywords: project.seed_keywords ? JSON.parse(project.seed_keywords) : [],
      });

      setSilos(
        silosData.map((s: { id: string; project_id: string; name: string; keywords?: string | null }) => ({
          id: s.id,
          projectId: s.project_id,
          name: s.name,
          keywords: s.keywords ? JSON.parse(s.keywords) : [],
        }))
      );

      setPages(
        pagesData.map((p: { id: string; project_id: string; silo_id: string | null; title: string; slug: string; meta_description: string | null; keywords: string | null; type: string; parent_id: string | null }) => ({
          id: p.id,
          projectId: p.project_id,
          siloId: p.silo_id,
          title: p.title,
          slug: p.slug,
          metaDescription: p.meta_description || '',
          keywords: p.keywords ? JSON.parse(p.keywords) : [],
          type: (['pillar', 'cluster', 'blog', 'category', 'landing'].includes(p.type) ? p.type : 'blog') as 'pillar' | 'cluster' | 'blog' | 'category' | 'landing',
          parentId: p.parent_id,
        }))
      );

      setSavedProjectId(project.id);
      setStep(2);
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (deleteConfirm === id) {
      try {
        await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        setProjects(projects.filter((p) => p.id !== id));
        resetStore();
        setDeleteConfirm(null);
      } catch (err) {
        console.error('Failed to delete project:', err);
      }
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <FolderOpen size={48} className="mx-auto mb-3 opacity-50" />
        <p>No saved projects yet</p>
        <p className="text-sm mt-1">Create a new project to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {projects.map((project) => (
        <div
          key={project.id}
          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors gap-2"
        >
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-medium truncate text-sm md:text-base">{project.name}</h4>
            <p className="text-slate-400 text-xs md:text-sm">{project.domain}</p>
            <p className="text-slate-500 text-[10px] md:text-xs mt-0.5">
              {project.niche && `${project.niche} · `}
              {project.language.toUpperCase()} · 
              Created {new Date(project.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => handleLoadProject(project)}
              className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
            >
              Load
            </button>
            <button
              onClick={() => handleDeleteProject(project.id)}
              className={`p-1.5 rounded transition-all ${
                deleteConfirm === project.id
                  ? 'text-red-400 bg-red-500/20'
                  : 'text-slate-400 hover:text-red-400'
              }`}
              title={deleteConfirm === project.id ? 'Click again to confirm' : 'Delete project'}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {deleteConfirm === project.id && (
            <p className="text-red-400 text-xs sm:hidden">Click trash again to confirm</p>
          )}
        </div>
      ))}
    </div>
  );
}
