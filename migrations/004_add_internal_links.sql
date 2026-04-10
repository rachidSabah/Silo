-- Migration 004: Add internal_links table
CREATE TABLE IF NOT EXISTS internal_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_page_id TEXT NOT NULL,
  to_page_id TEXT NOT NULL,
  anchor TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for faster lookups by project
CREATE INDEX IF NOT EXISTS idx_internal_links_project ON internal_links(project_id);
CREATE INDEX IF NOT EXISTS idx_internal_links_from ON internal_links(from_page_id);
CREATE INDEX IF NOT EXISTS idx_internal_links_to ON internal_links(to_page_id);
