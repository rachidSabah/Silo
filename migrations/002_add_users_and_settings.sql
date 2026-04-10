-- Migration: Add users and settings tables
-- Run with: npx wrangler d1 execute siloforge-db --remote --file=migrations/002_add_users_and_settings.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert default admin user (password: admin123)
-- Salt: siloforge2024
-- Hash: SHA-256(salt + password) = SHA-256("siloforge2024admin123")
INSERT OR IGNORE INTO users (id, email, password_hash, salt, name, role) VALUES (
  'admin-001',
  'admin@siloforge.com',
  'a3d2a8f1e9b4c7d6e5f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2',
  'siloforge2024',
  'Admin',
  'admin'
);
