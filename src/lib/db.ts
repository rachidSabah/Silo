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
    status: string | null;
    content: string | null;
    word_count: number | null;
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
let _migrationDone = false;
async function ensureMigration(db: D1Database) {
  if (_migrationDone) return;
  _migrationDone = true;
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

export async function createPage(data: { id: string; project_id: string; silo_id?: string | null; title: string; slug: string; meta_description?: string; keywords?: string; type: string; parent_id?: string | null; status?: string; content?: string; word_count?: number }) {
  if (isCloudflare()) {
    const db = getD1();
    await db.prepare('INSERT OR REPLACE INTO pages (id, project_id, silo_id, title, slug, meta_description, keywords, type, parent_id, status, content, word_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.project_id, data.silo_id || null, data.title, data.slug, data.meta_description || null, data.keywords || null, data.type, data.parent_id || null, data.status || 'draft', data.content || null, data.word_count || null).run();
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
    status: data.status || 'draft',
    content: data.content || null,
    word_count: data.word_count || null,
  });
}

export async function updatePage(id: string, data: { title?: string; slug?: string; meta_description?: string; keywords?: string; type?: string; silo_id?: string | null; parent_id?: string | null; status?: string; content?: string; word_count?: number }) {
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
  }
  return null;
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

export async function upsertAISetting(data: { id: string; user_id: string; provider: string; api_key: string; model: string; is_active?: number }) {
  if (isCloudflare()) {
    const db = getD1();
    // If this is active, deactivate others first
    if (data.is_active) {
      await db.prepare('UPDATE ai_settings SET is_active = 0 WHERE user_id = ?').bind(data.user_id).run();
    }
    await db.prepare('INSERT OR REPLACE INTO ai_settings (id, user_id, provider, api_key, model, is_active) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.user_id, data.provider, data.api_key, data.model, data.is_active ? 1 : 0).run();
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
