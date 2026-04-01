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
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Self-healing migrations for new columns
    await pool.query('ALTER TABLE books ADD COLUMN IF NOT EXISTS published_date TEXT');
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'");
    await pool.query('ALTER TABLE books ADD COLUMN IF NOT EXISTS page_count INT');

    console.log('Database connected and schema verified.'); 
    dbAvailable = true;
    return true;

  } catch (error) {
    console.warn('Database connection failed:', error.message);
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
      `SELECT id, title, author, description, cover_image, info_link,
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
    const dbId = book.isbn || book.id;
    const result = await pool.query(
      `INSERT INTO books (id, title, author, description, cover_image, info_link, embedding, average_rating, ratings_count, published_date, categories, page_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         author = EXCLUDED.author,
         description = EXCLUDED.description,
         cover_image = EXCLUDED.cover_image,
         embedding = EXCLUDED.embedding,
         average_rating = EXCLUDED.average_rating,
         ratings_count = EXCLUDED.ratings_count,
         published_date = EXCLUDED.published_date,
         categories = EXCLUDED.categories,
         page_count = EXCLUDED.page_count
       RETURNING id`,
      [dbId, book.title, book.author, book.description, book.coverImage, book.infoLink,
      `[${embedding.join(',')}]`, book.averageRating || 0, book.ratingsCount || 0,
      book.publishedDate || null, book.categories || [], book.pageCount || null]
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
      `SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, categories, page_count
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
      infoLink: row.info_link,
      averageRating: row.average_rating,
      ratingsCount: row.ratings_count,
      publishedDate: row.published_date,
      categories: row.categories || [],
      pageCount: row.page_count
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
      'SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, categories, page_count FROM books WHERE id = $1',
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
      infoLink: row.info_link,
      averageRating: row.average_rating,
      ratingsCount: row.ratings_count,
      publishedDate: row.published_date,
      categories: row.categories || [],
      pageCount: row.page_count
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

/**
 * Fetch a specific persisted featured section and its books.
 */
async function getPersistedFeaturedSections() {
  if (!dbAvailable) return null;
  try {
    const sectionsResult = await pool.query('SELECT section_name, book_ids, updated_at FROM featured_sections');
    if (sectionsResult.rows.length === 0) return null;

    const populatedSections = [];
    for (const section of sectionsResult.rows) {
      if (section.book_ids && section.book_ids.length > 0) {
        const booksResult = await pool.query(
          'SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, categories, page_count FROM books WHERE id = ANY($1)',
          [section.book_ids]
        );

        // Re-sort matches to respect the original book_ids order
        const bookMap = new Map(booksResult.rows.map(row => [row.id, {
          id: row.id,
          title: row.title,
          author: row.author,
          description: row.description,
          coverImage: row.cover_image,
          infoLink: row.info_link,
          averageRating: row.average_rating,
          ratingsCount: row.ratings_count,
          publishedDate: row.published_date,
          categories: row.categories || [],
          pageCount: row.page_count
        }]));

        populatedSections.push({
          title: section.section_name,
          updatedAt: section.updated_at,
          books: section.book_ids.map(id => bookMap.get(id)).filter(b => b)
        });
      }
    }
    return populatedSections;
  } catch (err) {
    console.error('Fetch persisted featured error:', err.message);
    return null;
  }
}

/**
 * Save or update a featured section snapshot.
 */
async function saveFeaturedSection(name, bookIds) {
  if (!dbAvailable) return;
  try {
    await pool.query(
      `INSERT INTO featured_sections (section_name, book_ids, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (section_name) DO UPDATE SET
         book_ids = EXCLUDED.book_ids,
         updated_at = NOW()`,
      [name, bookIds]
    );

    // Update stats for all featured books
    if (bookIds.length > 0) {
      await pool.query(
        'UPDATE books SET featured_count = featured_count + 1, last_featured_at = NOW() WHERE id = ANY($1)',
        [bookIds]
      );
    }
  } catch (err) {
    console.error('Save featured section error:', err.message);
  }
}

/**
 * Check if a search query is already embedded in the cache.
 */
async function getCachedSearch(query) {
  if (!dbAvailable) return null;
  try {
    const res = await pool.query(
      'UPDATE search_cache SET usage_count = usage_count + 1, last_used_at = NOW() WHERE search_query = $1 RETURNING embedding',
      [query.toLowerCase().trim()]
    );
    if (res.rows.length > 0) {
      const raw = res.rows[0].embedding;
      // If it's a string from the DB, clean and parse it.
      if (typeof raw === 'string') {
        return raw.replace(/[\[\]]/g, '').split(',').map(Number);
      }
      return raw;
    }
    return null;
  } catch (err) {
    console.error('Cache hit error:', err.message);
    return null;
  }
}

/**
 * Save a search query and its embedding to the cache.
 */
async function saveSearchToCache(query, embedding) {
  if (!dbAvailable || !embedding) return;
  try {
    await pool.query(
      'INSERT INTO search_cache (search_query, embedding) VALUES ($1, $2::vector) ON CONFLICT (search_query) DO NOTHING',
      [query.toLowerCase().trim(), `[${embedding.join(',')}]`]
    );
  } catch (err) {
    console.error('Cache save error:', err.message);
  }
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
  initDatabase,
  getPersistedFeaturedSections,
  saveFeaturedSection,
  getCachedSearch,
  saveSearchToCache
};
