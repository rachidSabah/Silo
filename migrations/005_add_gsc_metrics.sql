-- Migration 005: Add GSC (Google Search Console) metrics columns to pages table
-- Run with: npx wrangler d1 execute siloforge-db --remote --file=migrations/005_add_gsc_metrics.sql

-- GSC traffic metrics per page
ALTER TABLE pages ADD COLUMN gsc_clicks INTEGER DEFAULT 0;
ALTER TABLE pages ADD COLUMN gsc_impressions INTEGER DEFAULT 0;
ALTER TABLE pages ADD COLUMN gsc_position REAL DEFAULT 0;
ALTER TABLE pages ADD COLUMN gsc_ctr REAL DEFAULT 0;
ALTER TABLE pages ADD COLUMN gsc_last_synced TEXT;

-- Create index for aggregating GSC metrics by silo
CREATE INDEX IF NOT EXISTS idx_pages_silo_gsc ON pages(silo_id, gsc_clicks, gsc_impressions);
