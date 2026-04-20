-- GBP Locations: stores Google Business Profile connections
CREATE TABLE IF NOT EXISTS gbp_locations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  location_id TEXT,                -- Google's location ID
  location_name TEXT NOT NULL,     -- Business name
  address TEXT,                    -- Full formatted address
  phone TEXT,                      -- Primary phone
  lat REAL,                        -- Latitude
  lng REAL,                        -- Longitude
  access_token TEXT,               -- OAuth access token (encrypted at rest)
  refresh_token TEXT,              -- OAuth refresh token
  token_expires_at TEXT,           -- ISO timestamp
  category TEXT,                   -- Primary GBP category
  website_url TEXT,                -- Website URL from GBP
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- GeoGrid Scans: configuration and metadata for each scan
CREATE TABLE IF NOT EXISTS geogrid_scans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  gbp_location_id TEXT,            -- FK to gbp_locations
  keyword TEXT NOT NULL,           -- Target local keyword
  center_lat REAL NOT NULL,        -- Center latitude
  center_lng REAL NOT NULL,        -- Center longitude
  grid_size INTEGER DEFAULT 5,     -- Grid dimension (5 = 5x5 = 25 nodes)
  radius REAL DEFAULT 1.0,         -- Radius in miles
  business_name TEXT,              -- Business name to track
  status TEXT DEFAULT 'pending',   -- pending, running, completed, failed
  avg_rank REAL,                   -- Average rank across all nodes
  total_nodes INTEGER,             -- Total grid nodes
  nodes_found INTEGER,             -- Nodes where business was found
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- GeoGrid Nodes: individual ranking data per grid point
CREATE TABLE IF NOT EXISTS geogrid_nodes (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,           -- FK to geogrid_scans
  lat REAL NOT NULL,               -- Grid point latitude
  lng REAL NOT NULL,               -- Grid point longitude
  row_idx INTEGER NOT NULL,        -- Grid row index
  col_idx INTEGER NOT NULL,        -- Grid column index
  rank INTEGER,                    -- Ranking position (null = not found in top 20)
  business_name TEXT,              -- Matched business name
  competitors TEXT,                -- JSON array of top competitors at this point
  checked_at TEXT DEFAULT (datetime('now'))
);

-- Citations: directory listing tracker
CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  gbp_location_id TEXT,            -- FK to gbp_locations
  directory_name TEXT NOT NULL,     -- e.g., Yelp, Bing, Apple Maps
  directory_url TEXT,              -- URL of the listing
  listed_name TEXT,                -- Name as it appears
  listed_address TEXT,             -- Address as it appears
  listed_phone TEXT,               -- Phone as it appears
  nap_consistent INTEGER DEFAULT 0, -- 1 = NAP matches GBP exactly
  sync_status TEXT DEFAULT 'pending', -- pending, synced, mismatch, missing
  last_checked TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- GBP Posts: scheduled/published posts to GBP
CREATE TABLE IF NOT EXISTS gbp_posts (
  id TEXT PRIMARY KEY,
  gbp_location_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  post_type TEXT DEFAULT 'offer',  -- offer, event, call, update
  title TEXT,
  content TEXT NOT NULL,
  media_url TEXT,
  call_to_action TEXT,
  link_url TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT 'draft',     -- draft, scheduled, published, failed
  google_post_id TEXT,             -- ID returned by GBP API
  scheduled_at TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- GBP Reviews: cached reviews with AI-drafted replies
CREATE TABLE IF NOT EXISTS gbp_reviews (
  id TEXT PRIMARY KEY,
  gbp_location_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  google_review_id TEXT,           -- Google's review ID
  reviewer_name TEXT,
  rating INTEGER,                  -- 1-5 stars
  review_text TEXT,
  review_date TEXT,
  reply_text TEXT,                 -- Our reply (manual or AI-drafted)
  ai_draft_reply TEXT,             -- AI-generated reply suggestion
  reply_status TEXT DEFAULT 'pending', -- pending, drafted, replied, ignored
  replied_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gbp_locations_project ON gbp_locations(project_id);
CREATE INDEX IF NOT EXISTS idx_geogrid_scans_project ON geogrid_scans(project_id);
CREATE INDEX IF NOT EXISTS idx_geogrid_nodes_scan ON geogrid_nodes(scan_id);
CREATE INDEX IF NOT EXISTS idx_citations_project ON citations(project_id);
CREATE INDEX IF NOT EXISTS idx_gbp_posts_location ON gbp_posts(gbp_location_id);
CREATE INDEX IF NOT EXISTS idx_gbp_reviews_location ON gbp_reviews(gbp_location_id);
