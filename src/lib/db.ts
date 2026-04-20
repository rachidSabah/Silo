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
    user_id: string | null;
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
    status: string | null;
    content: string | null;
    word_count: number | null;
    gsc_clicks: number | null;
    gsc_impressions: number | null;
    gsc_position: number | null;
    gsc_ctr: number | null;
    gsc_last_synced: string | null;
  }>;
  internal_links: Array<{
    id: string;
    project_id: string;
    from_page_id: string;
    to_page_id: string;
    anchor: string;
    created_at: string;
  }>;
}

function getMemDB(): MemDB {
  if (!(globalThis as Record<string, unknown>).__siloforge_memdb) {
    (globalThis as Record<string, unknown>).__siloforge_memdb = {
      projects: [],
      silos: [],
      pages: [],
      internal_links: [],
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

// Auto-migrate: ensure silos table has keywords column, pages has status column
let _migrationPromise: Promise<void> | null = null;
async function ensureMigration(db: D1Database) {
  if (!_migrationPromise) {
    _migrationPromise = runMigrations(db);
  }
  await _migrationPromise;
}

async function runMigrations(db: D1Database) {
  try {
    await db.prepare('ALTER TABLE silos ADD COLUMN keywords TEXT').run();
  } catch { /* already exists */ }
  try {
    await db.prepare('ALTER TABLE pages ADD COLUMN status TEXT DEFAULT \'draft\'').run();
  } catch { /* already exists */ }
  try {
    await db.prepare('ALTER TABLE pages ADD COLUMN content TEXT').run();
  } catch { /* already exists */ }
  try {
    await db.prepare('ALTER TABLE pages ADD COLUMN word_count INTEGER').run();
  } catch { /* already exists */ }
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS internal_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      from_page_id TEXT NOT NULL,
      to_page_id TEXT NOT NULL,
      anchor TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
  } catch { /* already exists */ }
  // GSC metrics columns
  try {
    await db.prepare('ALTER TABLE pages ADD COLUMN gsc_clicks INTEGER DEFAULT 0').run();
  } catch { /* already exists */ }
  try {
    await db.prepare('ALTER TABLE pages ADD COLUMN gsc_impressions INTEGER DEFAULT 0').run();
  } catch { /* already exists */ }
  try {
    await db.prepare('ALTER TABLE pages ADD COLUMN gsc_position REAL DEFAULT 0').run();
  } catch { /* already exists */ }
  try {
    await db.prepare('ALTER TABLE pages ADD COLUMN gsc_ctr REAL DEFAULT 0').run();
  } catch { /* already exists */ }
  try {
    await db.prepare('ALTER TABLE pages ADD COLUMN gsc_last_synced TEXT').run();
  } catch { /* already exists */ }
  // AI settings: base_url column for custom provider support
  try {
    await db.prepare('ALTER TABLE ai_settings ADD COLUMN base_url TEXT NOT NULL DEFAULT \'\'').run();
  } catch { /* already exists */ }
  // Local SEO tables
  try { await db.prepare(`CREATE TABLE IF NOT EXISTS gbp_locations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, location_id TEXT, location_name TEXT NOT NULL, address TEXT, phone TEXT, lat REAL, lng REAL, access_token TEXT, refresh_token TEXT, token_expires_at TEXT, category TEXT, website_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`).run(); } catch {}
  try { await db.prepare(`CREATE TABLE IF NOT EXISTS geogrid_scans (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, gbp_location_id TEXT, keyword TEXT NOT NULL, center_lat REAL NOT NULL, center_lng REAL NOT NULL, grid_size INTEGER DEFAULT 5, radius REAL DEFAULT 1.0, business_name TEXT, status TEXT DEFAULT 'pending', avg_rank REAL, total_nodes INTEGER, nodes_found INTEGER, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT)`).run(); } catch {}
  try { await db.prepare(`CREATE TABLE IF NOT EXISTS geogrid_nodes (id TEXT PRIMARY KEY, scan_id TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, row_idx INTEGER NOT NULL, col_idx INTEGER NOT NULL, rank INTEGER, business_name TEXT, competitors TEXT, checked_at TEXT DEFAULT (datetime('now')))`).run(); } catch {}
  try { await db.prepare(`CREATE TABLE IF NOT EXISTS citations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, gbp_location_id TEXT, directory_name TEXT NOT NULL, directory_url TEXT, listed_name TEXT, listed_address TEXT, listed_phone TEXT, nap_consistent INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', last_checked TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`).run(); } catch {}
  try { await db.prepare(`CREATE TABLE IF NOT EXISTS gbp_posts (id TEXT PRIMARY KEY, gbp_location_id TEXT NOT NULL, project_id TEXT NOT NULL, post_type TEXT DEFAULT 'offer', title TEXT, content TEXT NOT NULL, media_url TEXT, call_to_action TEXT, link_url TEXT, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'draft', google_post_id TEXT, scheduled_at TEXT, published_at TEXT, created_at TEXT DEFAULT (datetime('now')))`).run(); } catch {}
  try { await db.prepare(`CREATE TABLE IF NOT EXISTS gbp_reviews (id TEXT PRIMARY KEY, gbp_location_id TEXT NOT NULL, project_id TEXT NOT NULL, google_review_id TEXT, reviewer_name TEXT, rating INTEGER, review_text TEXT, review_date TEXT, reply_text TEXT, ai_draft_reply TEXT, reply_status TEXT DEFAULT 'pending', replied_at TEXT, created_at TEXT DEFAULT (datetime('now')))`).run(); } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_gbp_locations_project ON gbp_locations(project_id)').run(); } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_geogrid_scans_project ON geogrid_scans(project_id)').run(); } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_geogrid_nodes_scan ON geogrid_nodes(scan_id)').run(); } catch {}
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_citations_project ON citations(project_id)').run(); } catch {}
}

// ===== Projects =====

export async function getAllProjects(userId?: string) {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    if (userId) {
      const { results } = await db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
      return results;
    }
    const { results } = await db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return results;
  }
  const mem = getMemDB();
  const filtered = userId ? mem.projects.filter(p => p.user_id === userId) : mem.projects;
  return [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getProjectById(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    return db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  }
  const mem = getMemDB();
  return mem.projects.find((p) => p.id === id) || null;
}

export async function createProject(data: { id: string; name: string; domain: string; language: string; niche?: string; seed_keywords?: string; user_id?: string }) {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    // Ensure user_id column exists
    try { await db.prepare('ALTER TABLE projects ADD COLUMN user_id TEXT').run(); } catch { /* already exists */ }
    await db.prepare('INSERT OR REPLACE INTO projects (id, name, domain, language, niche, seed_keywords, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.name, data.domain, data.language, data.niche || null, data.seed_keywords || null, data.user_id || null).run();
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
    user_id: data.user_id || null,
    created_at: new Date().toISOString(),
  });
}

export async function updateProject(id: string, data: { name?: string; domain?: string; language?: string; niche?: string; seed_keywords?: string }) {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.domain !== undefined) { fields.push('domain = ?'); values.push(data.domain); }
  if (data.language !== undefined) { fields.push('language = ?'); values.push(data.language); }
  if (data.niche !== undefined) { fields.push('niche = ?'); values.push(data.niche || null); }
  if (data.seed_keywords !== undefined) { fields.push('seed_keywords = ?'); values.push(data.seed_keywords || null); }

  if (fields.length === 0) return null;

  if (isCloudflare()) {
    values.push(id);
    const db = getD1();
    return db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }
  // In-memory update
  const mem = getMemDB();
  const project = mem.projects.find((p) => p.id === id);
  if (project) {
    if (data.name !== undefined) project.name = data.name;
    if (data.domain !== undefined) project.domain = data.domain;
    if (data.language !== undefined) project.language = data.language;
    if (data.niche !== undefined) project.niche = data.niche || null;
    if (data.seed_keywords !== undefined) project.seed_keywords = data.seed_keywords || null;
  }
  return null;
}

export async function deleteProject(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM internal_links WHERE project_id = ?').bind(id).run();
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
  for (let i = mem.internal_links.length - 1; i >= 0; i--) {
    if (mem.internal_links[i].project_id === id) mem.internal_links.splice(i, 1);
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

export async function createPage(data: { id: string; project_id: string; silo_id?: string | null; title: string; slug: string; meta_description?: string; keywords?: string; type: string; parent_id?: string | null; status?: string; content?: string; word_count?: number; gsc_clicks?: number; gsc_impressions?: number; gsc_position?: number; gsc_ctr?: number; target_keyword?: string; search_intent?: string; suggested_parent_keyword?: string }) {
  if (isCloudflare()) {
    const db = getD1();
    // Check if page already exists to preserve GSC metrics on update
    const existing = await db.prepare('SELECT gsc_clicks, gsc_impressions, gsc_position, gsc_ctr, gsc_last_synced FROM pages WHERE id = ?').bind(data.id).first() as Record<string, unknown> | null;
    if (existing) {
      // Update existing page, preserving GSC metrics that aren't explicitly provided
      const gscClicks = data.gsc_clicks !== undefined ? data.gsc_clicks : (existing.gsc_clicks as number) || 0;
      const gscImpressions = data.gsc_impressions !== undefined ? data.gsc_impressions : (existing.gsc_impressions as number) || 0;
      const gscPosition = data.gsc_position !== undefined ? data.gsc_position : (existing.gsc_position as number) || 0;
      const gscCtr = data.gsc_ctr !== undefined ? data.gsc_ctr : (existing.gsc_ctr as number) || 0;
      await db.prepare('UPDATE pages SET project_id = ?, silo_id = ?, title = ?, slug = ?, meta_description = ?, keywords = ?, type = ?, parent_id = ?, status = ?, content = ?, word_count = ?, gsc_clicks = ?, gsc_impressions = ?, gsc_position = ?, gsc_ctr = ?, target_keyword = ?, search_intent = ?, suggested_parent_keyword = ? WHERE id = ?')
        .bind(data.project_id, data.silo_id ?? null, data.title, data.slug, data.meta_description || null, data.keywords || null, data.type, data.parent_id ?? null, data.status || 'draft', data.content ?? null, data.word_count ?? null, gscClicks, gscImpressions, gscPosition, gscCtr, data.target_keyword ?? null, data.search_intent ?? null, data.suggested_parent_keyword ?? null, data.id).run();
    } else {
      await db.prepare('INSERT INTO pages (id, project_id, silo_id, title, slug, meta_description, keywords, type, parent_id, status, content, word_count, gsc_clicks, gsc_impressions, gsc_position, gsc_ctr, target_keyword, search_intent, suggested_parent_keyword) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(data.id, data.project_id, data.silo_id ?? null, data.title, data.slug, data.meta_description || null, data.keywords || null, data.type, data.parent_id ?? null, data.status || 'draft', data.content ?? null, data.word_count ?? null, data.gsc_clicks ?? 0, data.gsc_impressions ?? 0, data.gsc_position ?? 0, data.gsc_ctr ?? 0, data.target_keyword ?? null, data.search_intent ?? null, data.suggested_parent_keyword ?? null).run();
    }
    return;
  }
  const mem = getMemDB();
  const idx = mem.pages.findIndex((p) => p.id === data.id);
  if (idx !== -1) mem.pages.splice(idx, 1);
  mem.pages.push({
    id: data.id,
    project_id: data.project_id,
    silo_id: data.silo_id ?? null,
    title: data.title,
    slug: data.slug,
    meta_description: data.meta_description ?? null,
    keywords: data.keywords ?? null,
    type: data.type,
    parent_id: data.parent_id ?? null,
    status: data.status || 'draft',
    content: data.content ?? null,
    word_count: data.word_count ?? null,
    gsc_clicks: data.gsc_clicks ?? 0,
    gsc_impressions: data.gsc_impressions ?? 0,
    gsc_position: data.gsc_position ?? 0,
    gsc_ctr: data.gsc_ctr ?? 0,
    gsc_last_synced: null,
    target_keyword: data.target_keyword ?? null,
    search_intent: data.search_intent ?? null,
    suggested_parent_keyword: data.suggested_parent_keyword ?? null,
  });
}

export async function updatePage(id: string, data: { title?: string; slug?: string; meta_description?: string; keywords?: string; type?: string; silo_id?: string | null; parent_id?: string | null; status?: string; content?: string; word_count?: number; gsc_clicks?: number; gsc_impressions?: number; gsc_position?: number; gsc_ctr?: number; gsc_last_synced?: string; target_keyword?: string; search_intent?: string; suggested_parent_keyword?: string }) {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
  if (data.meta_description !== undefined) { fields.push('meta_description = ?'); values.push(data.meta_description); }
  if (data.keywords !== undefined) { fields.push('keywords = ?'); values.push(data.keywords); }
  if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
  if (data.silo_id !== undefined) { fields.push('silo_id = ?'); values.push(data.silo_id); }
  if (data.parent_id !== undefined) { fields.push('parent_id = ?'); values.push(data.parent_id); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
  if (data.word_count !== undefined) { fields.push('word_count = ?'); values.push(data.word_count); }
  if (data.gsc_clicks !== undefined) { fields.push('gsc_clicks = ?'); values.push(data.gsc_clicks); }
  if (data.gsc_impressions !== undefined) { fields.push('gsc_impressions = ?'); values.push(data.gsc_impressions); }
  if (data.gsc_position !== undefined) { fields.push('gsc_position = ?'); values.push(data.gsc_position); }
  if (data.gsc_ctr !== undefined) { fields.push('gsc_ctr = ?'); values.push(data.gsc_ctr); }
  if (data.gsc_last_synced !== undefined) { fields.push('gsc_last_synced = ?'); values.push(data.gsc_last_synced); }
  if (data.target_keyword !== undefined) { fields.push('target_keyword = ?'); values.push(data.target_keyword); }
  if (data.search_intent !== undefined) { fields.push('search_intent = ?'); values.push(data.search_intent); }
  if (data.suggested_parent_keyword !== undefined) { fields.push('suggested_parent_keyword = ?'); values.push(data.suggested_parent_keyword); }

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
    if (data.status !== undefined) page.status = data.status;
    if (data.content !== undefined) page.content = data.content;
    if (data.word_count !== undefined) page.word_count = data.word_count;
    if (data.gsc_clicks !== undefined) page.gsc_clicks = data.gsc_clicks;
    if (data.gsc_impressions !== undefined) page.gsc_impressions = data.gsc_impressions;
    if (data.gsc_position !== undefined) page.gsc_position = data.gsc_position;
    if (data.gsc_ctr !== undefined) page.gsc_ctr = data.gsc_ctr;
    if (data.gsc_last_synced !== undefined) page.gsc_last_synced = data.gsc_last_synced;
    if (data.target_keyword !== undefined) page.target_keyword = data.target_keyword;
    if (data.search_intent !== undefined) page.search_intent = data.search_intent;
    if (data.suggested_parent_keyword !== undefined) page.suggested_parent_keyword = data.suggested_parent_keyword;
  }
  return null;
}

// ===== GSC Analytics =====

export interface GSCSiloMetrics {
  silo_id: string;
  silo_name: string;
  total_clicks: number;
  total_impressions: number;
  avg_position: number;
  avg_ctr: number;
  page_count: number;
  top_page: { title: string; clicks: number } | null;
}

export async function getGSCMetricsBySilo(projectId: string): Promise<GSCSiloMetrics[]> {
  const pages = await getPagesByProject(projectId);
  const silos = await getSilosByProject(projectId);

  const siloMetrics: GSCSiloMetrics[] = [];

  for (const silo of silos) {
    const siloPages = pages.filter((p: Record<string, unknown>) => p.silo_id === silo.id);
    const totalClicks = siloPages.reduce((sum: number, p: Record<string, unknown>) => sum + ((p.gsc_clicks as number) || 0), 0);
    const totalImpressions = siloPages.reduce((sum: number, p: Record<string, unknown>) => sum + ((p.gsc_impressions as number) || 0), 0);
    const avgPosition = siloPages.length > 0
      ? siloPages.reduce((sum: number, p: Record<string, unknown>) => sum + ((p.gsc_position as number) || 0), 0) / siloPages.length
      : 0;
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // Find top performing page
    const sorted = [...siloPages].sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.gsc_clicks as number) || 0) - ((a.gsc_clicks as number) || 0));
    const topPage = sorted.length > 0
      ? { title: sorted[0].title as string, clicks: (sorted[0].gsc_clicks as number) || 0 }
      : null;

    siloMetrics.push({
      silo_id: silo.id as string,
      silo_name: silo.name as string,
      total_clicks: totalClicks,
      total_impressions: totalImpressions,
      avg_position: Math.round(avgPosition * 10) / 10,
      avg_ctr: Math.round(avgCtr * 100) / 100,
      page_count: siloPages.length,
      top_page: topPage,
    });
  }

  return siloMetrics;
}

export async function updatePageGSCMetrics(pageId: string, metrics: { clicks: number; impressions: number; position: number; ctr: number }) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('UPDATE pages SET gsc_clicks = ?, gsc_impressions = ?, gsc_position = ?, gsc_ctr = ?, gsc_last_synced = ? WHERE id = ?')
      .bind(metrics.clicks, metrics.impressions, metrics.position, metrics.ctr, new Date().toISOString(), pageId).run();
    return;
  }
  const mem = getMemDB();
  const page = mem.pages.find((p) => p.id === pageId);
  if (page) {
    page.gsc_clicks = metrics.clicks;
    page.gsc_impressions = metrics.impressions;
    page.gsc_position = metrics.position;
    page.gsc_ctr = metrics.ctr;
    page.gsc_last_synced = new Date().toISOString();
  }
}

export async function deletePage(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM internal_links WHERE from_page_id = ? OR to_page_id = ?').bind(id, id).run();
    await db.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
    return;
  }
  const mem = getMemDB();
  const idx = mem.pages.findIndex((p) => p.id === id);
  if (idx !== -1) mem.pages.splice(idx, 1);
  // Remove related links
  for (let i = mem.internal_links.length - 1; i >= 0; i--) {
    if (mem.internal_links[i].from_page_id === id || mem.internal_links[i].to_page_id === id) {
      mem.internal_links.splice(i, 1);
    }
  }
}

// ===== Internal Links =====

export async function getInternalLinksByProject(projectId: string) {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    const { results } = await db.prepare('SELECT * FROM internal_links WHERE project_id = ?').bind(projectId).all();
    return results;
  }
  const mem = getMemDB();
  return mem.internal_links.filter((l) => l.project_id === projectId);
}

export async function createInternalLink(data: { id: string; project_id: string; from_page_id: string; to_page_id: string; anchor: string }) {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    await db.prepare('INSERT OR REPLACE INTO internal_links (id, project_id, from_page_id, to_page_id, anchor) VALUES (?, ?, ?, ?, ?)')
      .bind(data.id, data.project_id, data.from_page_id, data.to_page_id, data.anchor).run();
    return;
  }
  const mem = getMemDB();
  const idx = mem.internal_links.findIndex((l) => l.id === data.id);
  if (idx !== -1) mem.internal_links.splice(idx, 1);
  mem.internal_links.push({
    id: data.id,
    project_id: data.project_id,
    from_page_id: data.from_page_id,
    to_page_id: data.to_page_id,
    anchor: data.anchor,
    created_at: new Date().toISOString(),
  });
}

export async function deleteInternalLink(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM internal_links WHERE id = ?').bind(id).run();
    return;
  }
  const mem = getMemDB();
  const idx = mem.internal_links.findIndex((l) => l.id === id);
  if (idx !== -1) mem.internal_links.splice(idx, 1);
}

export async function deleteInternalLinksByProject(projectId: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM internal_links WHERE project_id = ?').bind(projectId).run();
    return;
  }
  const mem = getMemDB();
  for (let i = mem.internal_links.length - 1; i >= 0; i--) {
    if (mem.internal_links[i].project_id === projectId) mem.internal_links.splice(i, 1);
  }
}

// ===== Users =====

interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

const memUsers: UserRecord[] = [];

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  if (isCloudflare()) {
    const db = getD1();
    return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() as Promise<UserRecord | null>;
  }
  return memUsers.find((u) => u.email === email) || null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  if (isCloudflare()) {
    const db = getD1();
    return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first() as Promise<UserRecord | null>;
  }
  return memUsers.find((u) => u.id === id) || null;
}

export async function getAllUsers(): Promise<UserRecord[]> {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT id, email, name, role, created_at, updated_at FROM users ORDER BY created_at DESC').all();
    return results as UserRecord[];
  }
  return memUsers.map(({ password_hash, salt, ...rest }) => rest as UserRecord);
}

export async function createUser(data: { id: string; email: string; password_hash: string; salt: string; name: string; role?: string }) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('INSERT INTO users (id, email, password_hash, salt, name, role) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.email, data.password_hash, data.salt, data.name, data.role || 'user').run();
    return;
  }
  memUsers.push({
    id: data.id,
    email: data.email,
    password_hash: data.password_hash,
    salt: data.salt,
    name: data.name,
    role: data.role || 'user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function updateUser(id: string, data: { email?: string; name?: string; role?: string; password_hash?: string; salt?: string }) {
  const fields: string[] = [];
  const values: string[] = [];

  if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
  if (data.password_hash !== undefined) { fields.push('password_hash = ?'); values.push(data.password_hash); }
  if (data.salt !== undefined) { fields.push('salt = ?'); values.push(data.salt); }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());

  if (isCloudflare()) {
    values.push(id);
    const db = getD1();
    await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    return;
  }
  const user = memUsers.find((u) => u.id === id);
  if (user) {
    if (data.email !== undefined) user.email = data.email;
    if (data.name !== undefined) user.name = data.name;
    if (data.role !== undefined) user.role = data.role;
    if (data.password_hash !== undefined) user.password_hash = data.password_hash;
    if (data.salt !== undefined) user.salt = data.salt;
    user.updated_at = new Date().toISOString();
  }
}

export async function deleteUser(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM ai_settings WHERE user_id = ?').bind(id).run();
    await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return;
  }
  const idx = memUsers.findIndex((u) => u.id === id);
  if (idx !== -1) memUsers.splice(idx, 1);
}

// ===== AI Settings =====

interface AISettingRecord {
  id: string;
  user_id: string;
  provider: string;
  api_key: string;
  model: string;
  base_url: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

const memSettings: AISettingRecord[] = [];

export async function getAISettingsByUser(userId: string): Promise<AISettingRecord[]> {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM ai_settings WHERE user_id = ?').bind(userId).all();
    return results as AISettingRecord[];
  }
  return memSettings.filter((s) => s.user_id === userId);
}

export async function getActiveAISetting(userId: string): Promise<AISettingRecord | null> {
  if (isCloudflare()) {
    const db = getD1();
    return db.prepare('SELECT * FROM ai_settings WHERE user_id = ? AND is_active = 1 LIMIT 1').bind(userId).first() as Promise<AISettingRecord | null>;
  }
  return memSettings.find((s) => s.user_id === userId && s.is_active === 1) || null;
}

export async function upsertAISetting(data: { id: string; user_id: string; provider: string; api_key: string; model: string; base_url?: string; is_active?: number }) {
  if (isCloudflare()) {
    const db = getD1();
    // If this is active, deactivate others first
    if (data.is_active) {
      await db.prepare('UPDATE ai_settings SET is_active = 0 WHERE user_id = ?').bind(data.user_id).run();
    }
    await db.prepare('INSERT OR REPLACE INTO ai_settings (id, user_id, provider, api_key, model, base_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.user_id, data.provider, data.api_key, data.model, data.base_url || '', data.is_active ? 1 : 0).run();
    return;
  }
  const idx = memSettings.findIndex((s) => s.id === data.id);
  if (data.is_active) {
    memSettings.forEach((s) => { if (s.user_id === data.user_id) s.is_active = 0; });
  }
  const record: AISettingRecord = {
    id: data.id,
    user_id: data.user_id,
    provider: data.provider,
    api_key: data.api_key,
    model: data.model,
    base_url: data.base_url || '',
    is_active: data.is_active ? 1 : 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (idx !== -1) {
    record.created_at = memSettings[idx].created_at;
    memSettings[idx] = record;
  } else {
    memSettings.push(record);
  }
}

export async function deleteAISetting(id: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM ai_settings WHERE id = ?').bind(id).run();
    return;
  }
  const idx = memSettings.findIndex((s) => s.id === id);
  if (idx !== -1) memSettings.splice(idx, 1);
}

export async function setActiveAISetting(id: string, userId: string) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('UPDATE ai_settings SET is_active = 0 WHERE user_id = ?').bind(userId).run();
    await db.prepare('UPDATE ai_settings SET is_active = 1 WHERE id = ?').bind(id).run();
    return;
  }
  memSettings.forEach((s) => { if (s.user_id === userId) s.is_active = 0; });
  const setting = memSettings.find((s) => s.id === id);
  if (setting) setting.is_active = 1;
}

// ===== Local SEO: Interfaces =====

interface GBPLocationRecord {
  id: string;
  project_id: string;
  location_id: string | null;
  location_name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  category: string | null;
  website_url: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface GeoGridScanRecord {
  id: string;
  project_id: string;
  gbp_location_id: string | null;
  keyword: string;
  center_lat: number;
  center_lng: number;
  grid_size: number;
  radius: number;
  business_name: string | null;
  status: string;
  avg_rank: number | null;
  total_nodes: number | null;
  nodes_found: number | null;
  created_at: string;
  completed_at: string | null;
}

interface GeoGridNodeRecord {
  id: string;
  scan_id: string;
  lat: number;
  lng: number;
  row_idx: number;
  col_idx: number;
  rank: number | null;
  business_name: string | null;
  competitors: string | null;
  checked_at: string;
}

interface CitationRecord {
  id: string;
  project_id: string;
  gbp_location_id: string | null;
  directory_name: string;
  directory_url: string | null;
  listed_name: string | null;
  listed_address: string | null;
  listed_phone: string | null;
  nap_consistent: number;
  sync_status: string;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

interface GBPPostRecord {
  id: string;
  gbp_location_id: string;
  project_id: string;
  post_type: string;
  title: string | null;
  content: string;
  media_url: string | null;
  call_to_action: string | null;
  link_url: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  google_post_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}

interface GBPReviewRecord {
  id: string;
  gbp_location_id: string;
  project_id: string;
  google_review_id: string | null;
  reviewer_name: string | null;
  rating: number | null;
  review_text: string | null;
  review_date: string | null;
  reply_text: string | null;
  ai_draft_reply: string | null;
  reply_status: string;
  replied_at: string | null;
  created_at: string;
}

// ===== Local SEO: In-memory arrays (dev mode) =====

const memGBPLocations: GBPLocationRecord[] = [];
const memGeoGridScans: GeoGridScanRecord[] = [];
const memGeoGridNodes: GeoGridNodeRecord[] = [];
const memCitations: CitationRecord[] = [];
const memGBPPosts: GBPPostRecord[] = [];
const memGBPReviews: GBPReviewRecord[] = [];

// ===== GBP Locations =====

export async function getGBPLocations(projectId: string): Promise<GBPLocationRecord[]> {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM gbp_locations WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
    return results as GBPLocationRecord[];
  }
  return memGBPLocations.filter(l => l.project_id === projectId);
}

export async function createGBPLocation(data: Omit<GBPLocationRecord, 'created_at' | 'updated_at'>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    await db.prepare('INSERT INTO gbp_locations (id, project_id, location_id, location_name, address, phone, lat, lng, access_token, refresh_token, token_expires_at, category, website_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.project_id, data.location_id, data.location_name, data.address, data.phone, data.lat, data.lng, data.access_token, data.refresh_token, data.token_expires_at, data.category, data.website_url, data.is_active).run();
    return;
  }
  memGBPLocations.push({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
}

export async function deleteGBPLocation(id: string): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM gbp_locations WHERE id = ?').bind(id).run();
    return;
  }
  const idx = memGBPLocations.findIndex(l => l.id === id);
  if (idx !== -1) memGBPLocations.splice(idx, 1);
}

// ===== GeoGrid Scans =====

export async function getGeoGridScans(projectId: string): Promise<GeoGridScanRecord[]> {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM geogrid_scans WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
    return results as GeoGridScanRecord[];
  }
  return memGeoGridScans.filter(s => s.project_id === projectId);
}

export async function getGeoGridScan(id: string): Promise<GeoGridScanRecord | null> {
  if (isCloudflare()) {
    const db = getD1();
    return db.prepare('SELECT * FROM geogrid_scans WHERE id = ?').bind(id).first() as Promise<GeoGridScanRecord | null>;
  }
  return memGeoGridScans.find(s => s.id === id) || null;
}

export async function createGeoGridScan(data: Omit<GeoGridScanRecord, 'created_at' | 'completed_at'>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    await db.prepare('INSERT INTO geogrid_scans (id, project_id, gbp_location_id, keyword, center_lat, center_lng, grid_size, radius, business_name, status, avg_rank, total_nodes, nodes_found) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.project_id, data.gbp_location_id, data.keyword, data.center_lat, data.center_lng, data.grid_size, data.radius, data.business_name, data.status, data.avg_rank, data.total_nodes, data.nodes_found).run();
    return;
  }
  memGeoGridScans.push({ ...data, created_at: new Date().toISOString(), completed_at: null });
}

export async function updateGeoGridScan(id: string, data: Partial<GeoGridScanRecord>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    vals.push(id);
    await db.prepare(`UPDATE geogrid_scans SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return;
  }
  const idx = memGeoGridScans.findIndex(s => s.id === id);
  if (idx !== -1) Object.assign(memGeoGridScans[idx], data);
}

// ===== GeoGrid Nodes =====

export async function getGeoGridNodes(scanId: string): Promise<GeoGridNodeRecord[]> {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM geogrid_nodes WHERE scan_id = ? ORDER BY row_idx, col_idx').bind(scanId).all();
    return results as GeoGridNodeRecord[];
  }
  return memGeoGridNodes.filter(n => n.scan_id === scanId);
}

export async function createGeoGridNode(data: GeoGridNodeRecord): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('INSERT INTO geogrid_nodes (id, scan_id, lat, lng, row_idx, col_idx, rank, business_name, competitors, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.scan_id, data.lat, data.lng, data.row_idx, data.col_idx, data.rank, data.business_name, data.competitors, data.checked_at).run();
    return;
  }
  memGeoGridNodes.push(data);
}

export async function createGeoGridNodesBatch(nodes: GeoGridNodeRecord[]): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    const stmt = db.prepare('INSERT INTO geogrid_nodes (id, scan_id, lat, lng, row_idx, col_idx, rank, business_name, competitors, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const batch = nodes.map(n => stmt.bind(n.id, n.scan_id, n.lat, n.lng, n.row_idx, n.col_idx, n.rank, n.business_name, n.competitors, n.checked_at));
    await db.batch(batch);
    return;
  }
  memGeoGridNodes.push(...nodes);
}

// ===== Citations =====

export async function getCitations(projectId: string): Promise<CitationRecord[]> {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM citations WHERE project_id = ? ORDER BY created_at DESC').bind(projectId).all();
    return results as CitationRecord[];
  }
  return memCitations.filter(c => c.project_id === projectId);
}

export async function createCitation(data: Omit<CitationRecord, 'created_at' | 'updated_at'>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    await db.prepare('INSERT INTO citations (id, project_id, gbp_location_id, directory_name, directory_url, listed_name, listed_address, listed_phone, nap_consistent, sync_status, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.project_id, data.gbp_location_id, data.directory_name, data.directory_url, data.listed_name, data.listed_address, data.listed_phone, data.nap_consistent, data.sync_status, data.last_checked).run();
    return;
  }
  memCitations.push({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
}

export async function updateCitation(id: string, data: Partial<CitationRecord>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    vals.push(id);
    await db.prepare(`UPDATE citations SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return;
  }
  const idx = memCitations.findIndex(c => c.id === id);
  if (idx !== -1) Object.assign(memCitations[idx], data);
}

export async function deleteCitation(id: string): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM citations WHERE id = ?').bind(id).run();
    return;
  }
  const idx = memCitations.findIndex(c => c.id === id);
  if (idx !== -1) memCitations.splice(idx, 1);
}

// ===== GBP Posts =====

export async function getGBPPosts(locationId: string): Promise<GBPPostRecord[]> {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM gbp_posts WHERE gbp_location_id = ? ORDER BY created_at DESC').bind(locationId).all();
    return results as GBPPostRecord[];
  }
  return memGBPPosts.filter(p => p.gbp_location_id === locationId);
}

export async function createGBPPost(data: Omit<GBPPostRecord, 'created_at'>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    await db.prepare('INSERT INTO gbp_posts (id, gbp_location_id, project_id, post_type, title, content, media_url, call_to_action, link_url, start_date, end_date, status, google_post_id, scheduled_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.gbp_location_id, data.project_id, data.post_type, data.title, data.content, data.media_url, data.call_to_action, data.link_url, data.start_date, data.end_date, data.status, data.google_post_id, data.scheduled_at, data.published_at).run();
    return;
  }
  memGBPPosts.push({ ...data, created_at: new Date().toISOString() });
}

export async function updateGBPPost(id: string, data: Partial<GBPPostRecord>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    vals.push(id);
    await db.prepare(`UPDATE gbp_posts SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return;
  }
  const idx = memGBPPosts.findIndex(p => p.id === id);
  if (idx !== -1) Object.assign(memGBPPosts[idx], data);
}

export async function deleteGBPPost(id: string): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('DELETE FROM gbp_posts WHERE id = ?').bind(id).run();
    return;
  }
  const idx = memGBPPosts.findIndex(p => p.id === id);
  if (idx !== -1) memGBPPosts.splice(idx, 1);
}

// ===== GBP Reviews =====

export async function getGBPReviews(locationId: string): Promise<GBPReviewRecord[]> {
  if (isCloudflare()) {
    const db = getD1();
    const { results } = await db.prepare('SELECT * FROM gbp_reviews WHERE gbp_location_id = ? ORDER BY created_at DESC').bind(locationId).all();
    return results as GBPReviewRecord[];
  }
  return memGBPReviews.filter(r => r.gbp_location_id === locationId);
}

export async function createGBPReview(data: Omit<GBPReviewRecord, 'created_at'>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    await ensureMigration(db);
    await db.prepare('INSERT INTO gbp_reviews (id, gbp_location_id, project_id, google_review_id, reviewer_name, rating, review_text, review_date, reply_text, ai_draft_reply, reply_status, replied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.gbp_location_id, data.project_id, data.google_review_id, data.reviewer_name, data.rating, data.review_text, data.review_date, data.reply_text, data.ai_draft_reply, data.reply_status, data.replied_at).run();
    return;
  }
  memGBPReviews.push({ ...data, created_at: new Date().toISOString() });
}

export async function updateGBPReview(id: string, data: Partial<GBPReviewRecord>): Promise<void> {
  if (isCloudflare()) {
    const db = getD1();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    vals.push(id);
    await db.prepare(`UPDATE gbp_reviews SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return;
  }
  const idx = memGBPReviews.findIndex(r => r.id === id);
  if (idx !== -1) Object.assign(memGBPReviews[idx], data);
}
