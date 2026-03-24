const { Pool } = require('pg');

let pool = null;
let dbAvailable = false;

/**
 * Initialize database connection pool.
 * Returns false if DB is not configured — app falls back to API-only mode.
 */
async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL configured — running in fallback mode (no vector search).');
    return false;
  }

  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Test connection
    await pool.query('SELECT 1');
    // Ensure pgvector extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('Database connected with pgvector support.');
    dbAvailable = true;
    return true;
  } catch (error) {
    console.warn('Database connection failed:', error.message);
    console.log('Running in fallback mode (no vector search).');
    pool = null;
    dbAvailable = false;
    return false;
  }
}

/**
 * Search for similar books using cosine similarity on embeddings.
 */
async function searchSimilarBooks(embedding, limit = 10) {
  if (!dbAvailable) return [];

  try {
    const result = await pool.query(
      `SELECT id, title, author, description, cover_image, isbn, info_link,
              1 - (embedding <=> $1::vector) AS similarity
       FROM books
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [`[${embedding.join(',')}]`, limit]
    );
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      coverImage: row.cover_image,
      isbn: row.isbn,
      infoLink: row.info_link,
      similarity: row.similarity,
    }));
  } catch (error) {
    console.error('Vector search error:', error.message);
    return [];
  }
}

/**
 * Store a book with its embedding in the database.
 */
async function storeBook(book, embedding) {
  if (!dbAvailable) return null;

  try {
    const result = await pool.query(
      `INSERT INTO books (title, author, description, cover_image, isbn, info_link, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
       ON CONFLICT (isbn) DO UPDATE SET
         description = EXCLUDED.description,
         cover_image = EXCLUDED.cover_image,
         embedding = EXCLUDED.embedding
       RETURNING id`,
      [book.title, book.author, book.description, book.coverImage, book.isbn, book.infoLink,
       `[${embedding.join(',')}]`]
    );
    return result.rows[0]?.id;
  } catch (error) {
    console.error('Store book error:', error.message);
    return null;
  }
}

/**
 * Get a book by its database ID.
 */
async function getBookById(id) {
  if (!dbAvailable) return null;

  try {
    const result = await pool.query('SELECT * FROM books WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      coverImage: row.cover_image,
      isbn: row.isbn,
      infoLink: row.info_link,
    };
  } catch (error) {
    console.error('Get book by ID error:', error.message);
    return null;
  }
}

function isDatabaseAvailable() {
  return dbAvailable;
}

// Initialize on import
initDatabase();

module.exports = { searchSimilarBooks, storeBook, getBookById, isDatabaseAvailable, initDatabase };
