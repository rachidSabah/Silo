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
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AppState {
  currentStep: number;
  project: Project | null;
  silos: Silo[];
  pages: Page[];
  savedProjectId: string | null;

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
  savedProjectId: null,
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
      removePage: (id) => set((state) => ({ pages: state.pages.filter((p) => p.id !== id) })),
      updatePage: (id, data) => set((state) => ({
        pages: state.pages.map((p) => (p.id === id ? { ...p, ...data } : p)),
      })),

      setSavedProjectId: (id) => set({ savedProjectId: id }),

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      logout: () => set({ ...initialState }),

      resetStore: () => set({ currentStep: 1, project: null, silos: [], pages: [], savedProjectId: null }),
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
