-- SiloForge D1 Database Schema
-- Run with: npx wrangler d1 execute siloforge-db --remote --file=migrations/001_init.sql

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
  keywords TEXT,
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
