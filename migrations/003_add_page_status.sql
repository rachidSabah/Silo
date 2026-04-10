-- Migration: Add status column to pages table
ALTER TABLE pages ADD COLUMN status TEXT DEFAULT 'draft';
