-- PlotSeekerAI Database Schema
-- Requires PostgreSQL with pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  cover_image TEXT,
  isbn TEXT UNIQUE,
  info_link TEXT,
  embedding vector(1536),
  average_rating FLOAT DEFAULT 0,
  ratings_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for fast cosine similarity search
-- Note: requires at least 100 rows before building this index
-- CREATE INDEX ON books USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- For small datasets, use HNSW index instead (works with any number of rows)
CREATE INDEX IF NOT EXISTS books_embedding_idx ON books USING hnsw (embedding vector_cosine_ops);
