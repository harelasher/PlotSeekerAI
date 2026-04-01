-- PlotSeekerAI Database Schema
-- Requires PostgreSQL with pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  series TEXT,
  author TEXT,
  description TEXT,
  cover_image TEXT,
  language TEXT,
  genres TEXT[] DEFAULT '{}',
  characters TEXT[] DEFAULT '{}',
  book_format TEXT,
  page_count INT DEFAULT 0,
  publisher TEXT,
  awards TEXT[] DEFAULT '{}',
  setting TEXT[] DEFAULT '{}',
  published_date TEXT,
  info_link TEXT,
  ratings_count INT DEFAULT 0,
  embedding vector(1536),
  average_rating FLOAT DEFAULT 0,
  clicks INT DEFAULT 0,
  last_clicked_at TIMESTAMPTZ DEFAULT NOW(),
  featured_count INT DEFAULT 0,
  last_featured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Homepage sections snapshot cache
CREATE TABLE IF NOT EXISTS featured_sections (
  id SERIAL PRIMARY KEY,
  section_name TEXT NOT NULL UNIQUE,
  book_ids TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- For small datasets, use HNSW index instead (works with any number of rows)
CREATE INDEX IF NOT EXISTS books_embedding_idx ON books USING hnsw (embedding vector_cosine_ops);

-- ==========================================
-- FUZZY SEARCH & RAG OPTIMIZATIONS
-- ==========================================

-- Enable Trigrams for highly tolerant typo matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN indexes to make fuzzy searching 50k+ rows instant
CREATE INDEX IF NOT EXISTS books_title_trgm_idx ON books USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS books_author_trgm_idx ON books USING GIN (author gin_trgm_ops);

-- Caching user search queries so we don't query OpenAI for the exact same phrase twice
CREATE TABLE IF NOT EXISTS search_cache (
  id SERIAL PRIMARY KEY,
  search_query TEXT UNIQUE NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  usage_count INT DEFAULT 1
);
