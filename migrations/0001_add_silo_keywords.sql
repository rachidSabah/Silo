-- Migration: Add keywords column to silos table
-- This migration must be applied to the D1 database

-- Add keywords column if it doesn't exist
-- D1 doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we use a safe approach
ALTER TABLE silos ADD COLUMN keywords TEXT;
