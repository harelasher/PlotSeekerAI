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
    
    // Self-healing migrations: Ensure click tracking columns exist
    await pool.query('ALTER TABLE books ADD COLUMN IF NOT EXISTS clicks INT DEFAULT 0');
    await pool.query('ALTER TABLE books ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ DEFAULT NOW()');
    
    console.log('Database connected with pgvector support and click tracking.');
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
       ORDER BY (embedding <=> $1::vector) - (COALESCE(ratings_count, 0) * COALESCE(average_rating, 0) / 100000.0)
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
      `INSERT INTO books (title, author, description, cover_image, isbn, info_link, embedding, average_rating, ratings_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9)
       ON CONFLICT (isbn) DO UPDATE SET
         description = EXCLUDED.description,
         cover_image = EXCLUDED.cover_image,
         embedding = EXCLUDED.embedding,
         average_rating = EXCLUDED.average_rating,
         ratings_count = EXCLUDED.ratings_count
       RETURNING id`,
      [book.title, book.author, book.description, book.coverImage, book.isbn, book.infoLink,
       `[${embedding.join(',')}]`, book.averageRating || 0, book.ratingsCount || 0]
    );
    return result.rows[0]?.id;
  } catch (error) {
    console.error('Store book error:', error.message);
    return null;
  }
}

/**
 * Clear all books from the database.
 */
async function clearBooksTable() {
  if (!dbAvailable) return;
  try {
    await pool.query('TRUNCATE books RESTART IDENTITY CASCADE');
    console.log('Database table "books" cleared.');
  } catch (err) {
    console.error('Clear table error:', err.message);
  }
}

/**
 * Increment click count for a specific book.
 */
async function incrementBookClick(id) {
  if (!dbAvailable) return;
  try {
    await pool.query(
      'UPDATE books SET clicks = clicks + 1, last_clicked_at = NOW() WHERE id = $1',
      [id]
    );
  } catch (err) {
    console.error('Click increment error:', err.message);
  }
}

/**
 * Fetch top trending books based on global user clicks.
 */
async function searchTrendingBooks(limit = 15) {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT id, title, author, description, cover_image, isbn, info_link, average_rating, ratings_count
       FROM books
       ORDER BY clicks DESC, last_clicked_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      coverImage: row.cover_image,
      isbn: row.isbn,
      infoLink: row.info_link,
      averageRating: row.average_rating,
      ratingsCount: row.ratings_count
    }));
  } catch (err) {
    console.error('Trending search error:', err.message);
    return [];
  }
}

/**
 * Get a book by its database ID.
 */
async function getBookById(id) {
  if (!dbAvailable) return null;

  try {
    const result = await pool.query(
      'SELECT id, title, author, description, cover_image, isbn, info_link, average_rating, ratings_count FROM books WHERE id = $1',
      [id]
    );
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
      averageRating: row.average_rating,
      ratingsCount: row.ratings_count
    };
  } catch (error) {
    console.error('Get book by ID error:', error.message);
    return null;
  }
}

/**
 * Store multiple books in the database.
 */
async function storeBooksBatch(items) {
  if (!dbAvailable || !items.length) return [];
  
  // We use Promise.all to save multiple books in parallel
  const results = await Promise.all(
    items.map(item => storeBook(item.book, item.embedding).catch(() => null))
  );
  return results.filter(id => id !== null);
}

function isDatabaseAvailable() {
  return dbAvailable;
}

// Initialize on import
initDatabase();

module.exports = { 
  searchSimilarBooks, 
  searchTrendingBooks,
  incrementBookClick,
  clearBooksTable,
  storeBook, 
  storeBooksBatch, 
  getBookById, 
  isDatabaseAvailable, 
  initDatabase 
};
