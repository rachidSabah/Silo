import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'seoforge.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      niche TEXT,
      seed_keywords TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS silos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      silo_id TEXT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      meta_description TEXT,
      keywords TEXT,
      type TEXT NOT NULL DEFAULT 'blog',
      parent_id TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (silo_id) REFERENCES silos(id) ON DELETE SET NULL
    );
  `);

  return _db;
}

// Initialize on import
export const db = getDb();

// Helper functions
export function getAllProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
}

export function getProjectById(id: string) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function createProject(data: { id: string; name: string; domain: string; language: string; niche?: string; seed_keywords?: string }) {
  return db.prepare(
    'INSERT INTO projects (id, name, domain, language, niche, seed_keywords) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(data.id, data.name, data.domain, data.language, data.niche || null, data.seed_keywords || null);
}

export function deleteProject(id: string) {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function getSilosByProject(projectId: string) {
  return db.prepare('SELECT * FROM silos WHERE project_id = ?').all(projectId);
}

export function createSilo(data: { id: string; project_id: string; name: string }) {
  return db.prepare(
    'INSERT INTO silos (id, project_id, name) VALUES (?, ?, ?)'
  ).run(data.id, data.project_id, data.name);
}

export function deleteSilo(id: string) {
  return db.prepare('DELETE FROM silos WHERE id = ?').run(id);
}

export function getPagesByProject(projectId: string) {
  return db.prepare('SELECT * FROM pages WHERE project_id = ?').all(projectId);
}

export function createPage(data: { id: string; project_id: string; silo_id?: string; title: string; slug: string; meta_description?: string; keywords?: string; type: string; parent_id?: string }) {
  return db.prepare(
    'INSERT INTO pages (id, project_id, silo_id, title, slug, meta_description, keywords, type, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(data.id, data.project_id, data.silo_id || null, data.title, data.slug, data.meta_description || null, data.keywords || null, data.type, data.parent_id || null);
}

export function updatePage(id: string, data: { title?: string; slug?: string; meta_description?: string; keywords?: string; type?: string; silo_id?: string; parent_id?: string }) {
  const fields: string[] = [];
  const values: (string | null | undefined)[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
  if (data.meta_description !== undefined) { fields.push('meta_description = ?'); values.push(data.meta_description); }
  if (data.keywords !== undefined) { fields.push('keywords = ?'); values.push(data.keywords); }
  if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
  if (data.silo_id !== undefined) { fields.push('silo_id = ?'); values.push(data.silo_id); }
  if (data.parent_id !== undefined) { fields.push('parent_id = ?'); values.push(data.parent_id); }

  if (fields.length === 0) return null;

  values.push(id);
  return db.prepare(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deletePage(id: string) {
  return db.prepare('DELETE FROM pages WHERE id = ?').run(id);
}
