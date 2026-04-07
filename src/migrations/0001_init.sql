CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingested_bundles (
  id INTEGER PRIMARY KEY,
  bundle_id TEXT NOT NULL UNIQUE,
  bundle_type TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  prev_bundle_id TEXT,
  transport_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  ciphertext_sha256 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_events (
  id INTEGER PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  ts TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_events_category_ts ON health_events(category, ts);

CREATE TABLE IF NOT EXISTS summaries_daily (
  day TEXT PRIMARY KEY,
  summary_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries_weekly (
  week TEXT PRIMARY KEY,
  summary_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
