-- Add SEO architecture fields to pages table for structured silo hierarchy
-- These fields store the AI-generated page architecture from the ARCHITECTURE_MASTER_PROMPT

ALTER TABLE pages ADD COLUMN target_keyword TEXT;
ALTER TABLE pages ADD COLUMN search_intent TEXT;
ALTER TABLE pages ADD COLUMN suggested_parent_keyword TEXT;
