'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { authFetch } from '@/lib/utils';

/**
 * Auto-save hook: When the user has unsaved changes (isDirty) and a project exists,
 * automatically save to D1 after a 3-second debounce. Also provides a manual save
 * function for the sidebar Save button.
 */
export function useAutoSave() {
  const { project, silos, pages, internalLinks, token, user, isDirty, markSaved, setIsSaving, setSavedProjectId } = useStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveProject = useCallback(async () => {
    if (!project || !token) return;

    setIsSaving(true);
    try {
      // 1. Save project
      const projectRes = await authFetch('/api/projects', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          name: project.name,
          domain: project.domain,
          language: project.language,
          niche: project.niche,
          seedKeywords: project.seedKeywords,
          seed_keywords: JSON.stringify(project.seedKeywords || []),
          user_id: user?.id || null,
        }),
      });
      if (!projectRes.ok) throw new Error('Failed to save project');

      // 2. Save silos (batch)
      for (const silo of silos) {
        await authFetch('/api/silos', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: silo.id,
            project_id: project.id,
            name: silo.name,
            keywords: silo.keywords ? JSON.stringify(silo.keywords) : null,
          }),
        });
      }

      // 3. Save pages (batch)
      for (const page of pages) {
        await authFetch('/api/pages', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: page.id,
            project_id: project.id,
            silo_id: page.siloId || null,
            title: page.title,
            slug: page.slug,
            meta_description: page.metaDescription,
            keywords: JSON.stringify(page.keywords),
            type: page.type,
            parent_id: page.parentId,
            status: page.status || 'draft',
            content: page.content || '',
            word_count: page.wordCount || 0,
          }),
        });
      }

      // 4. Save internal links (batch)
      for (const link of internalLinks) {
        await authFetch('/api/internal-links', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: link.id,
            project_id: project.id,
            from_page_id: link.fromPageId,
            to_page_id: link.toPageId,
            anchor: link.anchor,
          }),
        });
      }

      setSavedProjectId(project.id);
      markSaved();
    } catch (err) {
      console.error('Auto-save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, [project, silos, pages, internalLinks, token, user, markSaved, setIsSaving, setSavedProjectId]);

  // Auto-save with 3-second debounce when dirty
  useEffect(() => {
    if (isDirty && project && token) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveProject();
      }, 3000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDirty, project, token, saveProject]);

  return { saveProject };
}
