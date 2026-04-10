import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Project {
  id: string;
  name: string;
  domain: string;
  language: string;
  niche: string;
  seedKeywords: string[];
}

export interface Silo {
  id: string;
  projectId: string;
  name: string;
  keywords: string[];
}

export type PageStatus = 'draft' | 'in_progress' | 'review' | 'published';

export interface Page {
  id: string;
  projectId: string;
  siloId: string | null;
  title: string;
  slug: string;
  metaDescription: string;
  keywords: string[];
  type: 'pillar' | 'cluster' | 'blog' | 'category' | 'landing';
  parentId: string | null;
  status: PageStatus;
  content: string; // Generated article HTML/Markdown content
  wordCount: number; // Approximate word count of generated content
}

export interface InternalLink {
  id: string;
  projectId: string;
  fromPageId: string;
  toPageId: string;
  anchor: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface KeywordCluster {
  name: string;
  keywords: string[];
  intent: 'informational' | 'navigational' | 'transactional' | 'commercial';
}

export interface ContentGap {
  topic: string;
  keywords: string[];
  priority: 'high' | 'medium' | 'low';
  suggestedSilo: string;
}

export interface ContentBrief {
  title: string;
  targetKeywords: string[];
  searchIntent: string;
  contentType: string;
  wordCountTarget: string;
  outline: string[];
  keyPoints: string[];
  internalLinkTargets: string[];
  metaDescription: string;
  callToAction: string;
}

export interface GeneratedArticle {
  pageId: string;
  title: string;
  content: string; // HTML content
  wordCount: number;
  internalLinks: Array<{ anchor: string; targetSlug: string }>;
  metaDescription: string;
}

export interface CMSConfig {
  id: string;
  type: 'wordpress' | 'webhook' | 'headless';
  name: string;
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
  isActive: boolean;
}

interface AppState {
  currentStep: number;
  project: Project | null;
  silos: Silo[];
  pages: Page[];
  internalLinks: InternalLink[];
  savedProjectId: string | null;

  // AI results cache
  keywordClusters: KeywordCluster[];
  contentGaps: ContentGap[];
  contentBrief: ContentBrief | null;
  generatedArticles: GeneratedArticle[];
  bulkGeneratingProgress: { current: number; total: number; siloName: string } | null;

  // CMS configs
  cmsConfigs: CMSConfig[];

  // Auth
  user: AuthUser | null;
  token: string | null;

  // Step navigation
  setStep: (step: number) => void;

  // Project actions
  setProject: (project: Project) => void;

  // Silo actions
  setSilos: (silos: Silo[]) => void;
  addSilo: (silo: Silo) => void;
  removeSilo: (id: string) => void;
  updateSilo: (id: string, data: Partial<Silo>) => void;

  // Page actions
  setPages: (pages: Page[]) => void;
  addPage: (page: Page) => void;
  addPages: (pages: Page[]) => void;
  removePage: (id: string) => void;
  updatePage: (id: string, data: Partial<Page>) => void;

  // Internal Link actions
  setInternalLinks: (links: InternalLink[]) => void;
  addInternalLink: (link: InternalLink) => void;
  addInternalLinks: (links: InternalLink[]) => void;
  removeInternalLink: (id: string) => void;

  // AI results actions
  setKeywordClusters: (clusters: KeywordCluster[]) => void;
  setContentGaps: (gaps: ContentGap[]) => void;
  setContentBrief: (brief: ContentBrief | null) => void;
  setGeneratedArticles: (articles: GeneratedArticle[]) => void;
  addGeneratedArticle: (article: GeneratedArticle) => void;
  setBulkGeneratingProgress: (progress: { current: number; total: number; siloName: string } | null) => void;

  // CMS actions
  setCMSConfigs: (configs: CMSConfig[]) => void;
  addCMSConfig: (config: CMSConfig) => void;
  removeCMSConfig: (id: string) => void;
  updateCMSConfig: (id: string, data: Partial<CMSConfig>) => void;

  // Project ID
  setSavedProjectId: (id: string | null) => void;

  // Auth actions
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;

  // Reset
  resetStore: () => void;
}

const initialState = {
  currentStep: 1,
  project: null,
  silos: [],
  pages: [],
  internalLinks: [],
  savedProjectId: null,
  keywordClusters: [],
  contentGaps: [],
  contentBrief: null,
  generatedArticles: [],
  bulkGeneratingProgress: null,
  cmsConfigs: [],
  user: null,
  token: null,
};

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,

      setStep: (step) => set({ currentStep: step }),

      setProject: (project) => set({ project }),

      setSilos: (silos) => set({ silos }),
      addSilo: (silo) => set((state) => ({ silos: [...state.silos, silo] })),
      removeSilo: (id) => set((state) => ({
        silos: state.silos.filter((s) => s.id !== id),
        pages: state.pages.map((p) => p.siloId === id ? { ...p, siloId: null } : p),
      })),
      updateSilo: (id, data) => set((state) => ({
        silos: state.silos.map((s) => (s.id === id ? { ...s, ...data } : s)),
      })),

      setPages: (pages) => set({ pages }),
      addPage: (page) => set((state) => ({ pages: [...state.pages, page] })),
      addPages: (pages) => set((state) => ({ pages: [...state.pages, ...pages] })),
      removePage: (id) => set((state) => ({
        pages: state.pages.filter((p) => p.id !== id),
        internalLinks: state.internalLinks.filter((l) => l.fromPageId !== id && l.toPageId !== id),
      })),
      updatePage: (id, data) => set((state) => ({
        pages: state.pages.map((p) => (p.id === id ? { ...p, ...data } : p)),
      })),

      setInternalLinks: (internalLinks) => set({ internalLinks }),
      addInternalLink: (link) => set((state) => ({ internalLinks: [...state.internalLinks, link] })),
      addInternalLinks: (links) => set((state) => ({ internalLinks: [...state.internalLinks, ...links] })),
      removeInternalLink: (id) => set((state) => ({
        internalLinks: state.internalLinks.filter((l) => l.id !== id),
      })),

      setKeywordClusters: (keywordClusters) => set({ keywordClusters }),
      setContentGaps: (contentGaps) => set({ contentGaps }),
      setContentBrief: (contentBrief) => set({ contentBrief }),
      setGeneratedArticles: (generatedArticles) => set({ generatedArticles }),
      addGeneratedArticle: (article) => set((state) => ({
        generatedArticles: [...state.generatedArticles.filter(a => a.pageId !== article.pageId), article],
      })),
      setBulkGeneratingProgress: (bulkGeneratingProgress) => set({ bulkGeneratingProgress }),

      setCMSConfigs: (cmsConfigs) => set({ cmsConfigs }),
      addCMSConfig: (config) => set((state) => ({ cmsConfigs: [...state.cmsConfigs, config] })),
      removeCMSConfig: (id) => set((state) => ({ cmsConfigs: state.cmsConfigs.filter((c) => c.id !== id) })),
      updateCMSConfig: (id, data) => set((state) => ({
        cmsConfigs: state.cmsConfigs.map((c) => (c.id === id ? { ...c, ...data } : c)),
      })),

      setSavedProjectId: (id) => set({ savedProjectId: id }),

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      logout: () => set({ ...initialState }),

      resetStore: () => set({
        currentStep: 1, project: null, silos: [], pages: [],
        internalLinks: [], savedProjectId: null,
        keywordClusters: [], contentGaps: [], contentBrief: null,
        generatedArticles: [], bulkGeneratingProgress: null, cmsConfigs: [],
      }),
    }),
    {
      name: 'siloforge-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    }
  )
);
