import { getRequestContext } from '@cloudflare/next-on-pages';

export function getDB(): D1Database {
  const { env } = getRequestContext();
  return env.DB as D1Database;
}

// ===== Projects =====

export async function getAllProjects() {
  const db = getDB();
  const { results } = await db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  return results;
}

export async function getProjectById(id: string) {
  const db = getDB();
  const result = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  return result;
}

export async function createProject(data: { id: string; name: string; domain: string; language: string; niche?: string; seed_keywords?: string }) {
  const db = getDB();
  await db.prepare(
    'INSERT INTO projects (id, name, domain, language, niche, seed_keywords) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(data.id, data.name, data.domain, data.language, data.niche || null, data.seed_keywords || null).run();
}

export async function deleteProject(id: string) {
  const db = getDB();
  await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
}

// ===== Silos =====

export async function getSilosByProject(projectId: string) {
  const db = getDB();
  const { results } = await db.prepare('SELECT * FROM silos WHERE project_id = ?').bind(projectId).all();
  return results;
}

export async function createSilo(data: { id: string; project_id: string; name: string }) {
  const db = getDB();
  await db.prepare(
    'INSERT INTO silos (id, project_id, name) VALUES (?, ?, ?)'
  ).bind(data.id, data.project_id, data.name).run();
}

export async function deleteSilo(id: string) {
  const db = getDB();
  await db.prepare('DELETE FROM silos WHERE id = ?').bind(id).run();
}

// ===== Pages =====

export async function getPagesByProject(projectId: string) {
  const db = getDB();
  const { results } = await db.prepare('SELECT * FROM pages WHERE project_id = ?').bind(projectId).all();
  return results;
}

export async function createPage(data: { id: string; project_id: string; silo_id?: string; title: string; slug: string; meta_description?: string; keywords?: string; type: string; parent_id?: string }) {
  const db = getDB();
  await db.prepare(
    'INSERT INTO pages (id, project_id, silo_id, title, slug, meta_description, keywords, type, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(data.id, data.project_id, data.silo_id || null, data.title, data.slug, data.meta_description || null, data.keywords || null, data.type, data.parent_id || null).run();
}

export async function updatePage(id: string, data: { title?: string; slug?: string; meta_description?: string; keywords?: string; type?: string; silo_id?: string; parent_id?: string }) {
  const db = getDB();
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

  values.push(id);
  return db.prepare(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deletePage(id: string) {
  const db = getDB();
  await db.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
}
