-- Migration: Add base_url column to ai_settings for custom provider support
-- Run with: npx wrangler d1 execute siloforge-db --remote --file=migrations/007_add_base_url_to_ai_settings.sql

ALTER TABLE ai_settings ADD COLUMN base_url TEXT NOT NULL DEFAULT '';
