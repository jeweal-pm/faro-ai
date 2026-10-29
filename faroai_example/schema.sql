-- Generic portable schema. It is intentionally independent of Muksha's MySQL/CMS tables.
-- The PHP reference implementation also creates these tables with IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    path TEXT,
    image TEXT,
    product_type TEXT,
    metal TEXT,
    metal_karat TEXT,
    metal_color TEXT,
    stone_type TEXT,
    stone_shape TEXT,
    stone_carat REAL,
    price REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    weight REAL,
    availability TEXT,
    search_text TEXT,
    summary TEXT
);

CREATE TABLE IF NOT EXISTS site_content (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    status INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS faq_items (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    status INTEGER NOT NULL DEFAULT 1,
    sequence INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS faroai_gaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL UNIQUE,
    text TEXT NOT NULL,
    reason TEXT NOT NULL,
    lang TEXT NOT NULL,
    hits INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faroai_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    intent TEXT,
    lang TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faroai_synonyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phrase TEXT NOT NULL UNIQUE,
    filter_key TEXT NOT NULL,
    filter_value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_faroai_gaps_last_seen ON faroai_gaps(last_seen);
CREATE INDEX IF NOT EXISTS idx_faroai_feedback_created ON faroai_feedback(created_at);

-- Optional FTS5 index. The reference code works without it and falls back to LIKE/token scoring.
CREATE VIRTUAL TABLE IF NOT EXISTS products_search USING fts5(
    sku, name, product_type, metal, metal_color, stone_type, stone_shape, search_text, summary,
    content='products', content_rowid='id'
);
