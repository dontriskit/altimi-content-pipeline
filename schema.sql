-- Altimi Content Pipeline — D1 Schema

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  target_site TEXT NOT NULL CHECK(target_site IN ('altimitech.com', 'altimi-dev.com')),
  primary_keyword TEXT,
  sequence_position INTEGER, -- 1-6 within track

  -- Research streams (3 per article)
  stream_1_status TEXT DEFAULT 'pending',
  stream_1_interaction_id TEXT,
  stream_2_status TEXT DEFAULT 'pending',
  stream_2_interaction_id TEXT,
  stream_3_status TEXT DEFAULT 'pending',
  stream_3_interaction_id TEXT,

  -- Pipeline stages
  research_status TEXT DEFAULT 'pending',
  synthesis_status TEXT DEFAULT 'pending',
  article_status TEXT DEFAULT 'pending',
  images_status TEXT DEFAULT 'pending',
  assembly_status TEXT DEFAULT 'pending',
  publish_status TEXT DEFAULT 'pending',

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  published_at TEXT,

  -- GitHub issue reference
  github_issue TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_target ON articles(target_site);
CREATE INDEX IF NOT EXISTS idx_articles_research ON articles(research_status);
