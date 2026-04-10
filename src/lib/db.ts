// Dual database: In-memory (via globalThis) for local dev, D1 for Cloudflare
// Uses direct import from @cloudflare/next-on-pages with try/catch for local dev fallback.
// Note: better-sqlite3 cannot be used because edge runtime doesn't support Node.js 'fs' module.

import { getRequestContext } from '@cloudflare/next-on-pages';

// Use globalThis to persist in-memory data across edge runtime requests
interface MemDB {
  projects: Array<{
    id: string;
    name: string;
    domain: string;
    language: string;
    niche: string | null;
    seed_keywords: string | null;
    created_at: string;
  }>;
  silos: Array<{
    id: string;
    project_id: string;
    name: string;
    keywords: string | null;
  }>;
  pages: Array<{
    id: string;
    project_id: string;
    silo_id: string | null;
    title: string;
    slug: string;
    meta_description: string | null;
    keywords: string | null;
    type: string;
    parent_id: string | null;
  }>;
}

function getMemDB(): MemDB {
  if (!(globalThis as Record<string, unknown>).__siloforge_memdb) {
    (globalThis as Record<string, unknown>).__siloforge_memdb = {
      projects: [],
      silos: [],
      pages: [],
    };
  }
  return (globalThis as Record<string, unknown>).__siloforge_memdb as MemDB;
}

function isCloudflare(): boolean {
  try {
    const ctx = getRequestContext();
    const db = ctx?.env?.DB;
    if (db && typeof db.prepare === 'function') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getD1(): D1Database {
  const { env } = getRequestContext();
  return env.DB as D1Database;
}

// Auto-migrate: ensure silos table has keywords column
let _migrationDone = false;
async function ensureMigration(db: D1Database) {
  if (_migrationDone) return;
  _migrationDone = true;
  try {
    // Try to add keywords column to silos (ignore error if it already exists)
    await db.prepare('ALTER TABLE silos ADD COLUMN keywords TEXT').run();
  } catch {
    // Column already exists, which is fine
  }
}

// ===== Projects =====

export async function getAllProjects() {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    const { results } = await db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return results;
  }
  const mem = getMemDB();
  return [...mem.projects].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getProjectById(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    return db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  }
  const mem = getMemDB();
  return mem.projects.find((p) => p.id === id) || null;
}

export async function createProject(data: { id: string; name: string; domain: string; language: string; niche?: string; seed_keywords?: string }) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('INSERT OR REPLACE INTO projects (id, name, domain, language, niche, seed_keywords) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.name, data.domain, data.language, data.niche || null, data.seed_keywords || null).run();
    return;
  }
  const mem = getMemDB();
  const idx = mem.projects.findIndex((p) => p.id === data.id);
  if (idx !== -1) mem.projects.splice(idx, 1);
  mem.projects.push({
    id: data.id,
    name: data.name,
    domain: data.domain,
    language: data.language,
    niche: data.niche || null,
    seed_keywords: data.seed_keywords || null,
    created_at: new Date().toISOString(),
  });
}

export async function deleteProject(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM pages WHERE project_id = ?').bind(id).run();
    await db.prepare('DELETE FROM silos WHERE project_id = ?').bind(id).run();
    await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return;
  }
  const mem = getMemDB();
  const pi = mem.projects.findIndex((p) => p.id === id);
  if (pi !== -1) mem.projects.splice(pi, 1);
  for (let i = mem.silos.length - 1; i >= 0; i--) {
    if (mem.silos[i].project_id === id) mem.silos.splice(i, 1);
  }
  for (let i = mem.pages.length - 1; i >= 0; i--) {
    if (mem.pages[i].project_id === id) mem.pages.splice(i, 1);
  }
}

// ===== Silos =====

export async function getSilosByProject(projectId: string) {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM silos WHERE project_id = ?').bind(projectId).all();
    return results;
  }
  const mem = getMemDB();
  return mem.silos.filter((s) => s.project_id === projectId);
}

export async function createSilo(data: { id: string; project_id: string; name: string; keywords?: string }) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('INSERT OR REPLACE INTO silos (id, project_id, name, keywords) VALUES (?, ?, ?, ?)')
      .bind(data.id, data.project_id, data.name, data.keywords || null).run();
    return;
  }
  const mem = getMemDB();
  const idx = mem.silos.findIndex((s) => s.id === data.id);
  if (idx !== -1) mem.silos.splice(idx, 1);
  mem.silos.push({
    id: data.id,
    project_id: data.project_id,
    name: data.name,
    keywords: data.keywords || null,
  });
}

export async function updateSilo(id: string, data: { name?: string; keywords?: string }) {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.keywords !== undefined) { fields.push('keywords = ?'); values.push(data.keywords); }

  if (fields.length === 0) return null;

  if (isCloudflare()) {
    values.push(id);
    const db = getD1();
    return db.prepare(`UPDATE silos SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }
  // In-memory update
  const mem = getMemDB();
  const silo = mem.silos.find((s) => s.id === id);
  if (silo) {
    if (data.name !== undefined) silo.name = data.name;
    if (data.keywords !== undefined) silo.keywords = data.keywords;
  }
  return null;
}

export async function deleteSilo(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('UPDATE pages SET silo_id = NULL WHERE silo_id = ?').bind(id).run();
    await db.prepare('DELETE FROM silos WHERE id = ?').bind(id).run();
    return;
  }
  const mem = getMemDB();
  const idx = mem.silos.findIndex((s) => s.id === id);
  if (idx !== -1) mem.silos.splice(idx, 1);
  mem.pages.forEach((p) => {
    if (p.silo_id === id) p.silo_id = null;
  });
}

// ===== Pages =====

export async function getPagesByProject(projectId: string) {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM pages WHERE project_id = ?').bind(projectId).all();
    return results;
  }
  const mem = getMemDB();
  return mem.pages.filter((p) => p.project_id === projectId);
}

export async function createPage(data: { id: string; project_id: string; silo_id?: string | null; title: string; slug: string; meta_description?: string; keywords?: string; type: string; parent_id?: string | null }) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('INSERT OR REPLACE INTO pages (id, project_id, silo_id, title, slug, meta_description, keywords, type, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.project_id, data.silo_id || null, data.title, data.slug, data.meta_description || null, data.keywords || null, data.type, data.parent_id || null).run();
    return;
  }
  const mem = getMemDB();
  const idx = mem.pages.findIndex((p) => p.id === data.id);
  if (idx !== -1) mem.pages.splice(idx, 1);
  mem.pages.push({
    id: data.id,
    project_id: data.project_id,
    silo_id: data.silo_id || null,
    title: data.title,
    slug: data.slug,
    meta_description: data.meta_description || null,
    keywords: data.keywords || null,
    type: data.type,
    parent_id: data.parent_id || null,
  });
}

export async function updatePage(id: string, data: { title?: string; slug?: string; meta_description?: string; keywords?: string; type?: string; silo_id?: string | null; parent_id?: string | null }) {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
  if (data.meta_description !== undefined) { fields.push('meta_description = ?'); values.push(data.meta_description); }
  if (data.keywords !== undefined) { fields.push('keywords = ?'); values.push(data.keywords); }
  if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
  if (data.silo_id !== undefined) { fields.push('silo_id = ?'); values.push(data.silo_id); }
  if (data.parent_id !== undefined) { fields.push('parent_id = ?'); values.push(data.parent_id); }

  if (fields.length === 0) return null;

  if (isCloudflare()) {
    values.push(id);
    const db = getD1();
    return db.prepare(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }
  // In-memory update
  const mem = getMemDB();
  const page = mem.pages.find((p) => p.id === id);
  if (page) {
    if (data.title !== undefined) page.title = data.title;
    if (data.slug !== undefined) page.slug = data.slug;
    if (data.meta_description !== undefined) page.meta_description = data.meta_description;
    if (data.keywords !== undefined) page.keywords = data.keywords;
    if (data.type !== undefined) page.type = data.type;
    if (data.silo_id !== undefined) page.silo_id = data.silo_id;
    if (data.parent_id !== undefined) page.parent_id = data.parent_id;
  }
  return null;
}

export async function deletePage(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
    return;
  }
  const mem = getMemDB();
  const idx = mem.pages.findIndex((p) => p.id === id);
  if (idx !== -1) mem.pages.splice(idx, 1);
}
