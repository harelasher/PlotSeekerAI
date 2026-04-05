/**
 * database.js
 * Core service for the PostgreSQL database connection.
 * Handles hybrid search logic, migrations, and CRUD operations.
 */
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

    // Add global error handler to the pool to prevent it from crashing the process
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client:', err.message);
    });

    // CRITICAL: Perform a "warm-up" query to ensure DB is actually reachable 
    // and wait for connection (e.g., wake up Neon/Postgres) before returning.
    await pool.query('SELECT 1');
    
    // HNSW Optimization: Set search depth to 100 for high precision at scale
    await pool.query('SET hnsw.ef_search = 100');

    // Ensure the cache table has all the modern columns needed for performance
    await pool.query('ALTER TABLE search_cache ADD COLUMN IF NOT EXISTS top_result_ids TEXT[]');
    await pool.query('ALTER TABLE search_cache ADD COLUMN IF NOT EXISTS explanations JSONB');

    console.log('Database connected and schema verified (HNSW optimized).');
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
 * Classify intent from query length to determine weighting strategy.
 * Returns weights for [vector, textMatch, fullText]
 */
function classifyQueryIntent(query) {
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount <= 3) {
    // Short: "Matt Haig" or "The Midnight Library" — text match dominates
    return { vector: 0.25, text: 0.65, fullText: 0.10, label: 'known-item' };
  } else if (wordCount <= 10) {
    // Medium: "cozy mystery set in a bookshop" — balanced
    return { vector: 0.50, text: 0.25, fullText: 0.25, label: 'vibe' };
  } else {
    // Long: detailed plot description — vector + full-text dominate
    return { vector: 0.60, text: 0.10, fullText: 0.30, label: 'plot-detail' };
  }
}

/**
 * 3-Layer Hybrid Search:
 * Layer 1: Vector similarity (semantic/vibe)
 * Layer 2: pg_trgm text match on title + author (known-item)
 * Layer 3: Postgres full-text search on title + author + description (plot-detail)
 *
 * All three run in PARALLEL, then scores are merged with intent-aware weights.
 */
async function hybridSearchBooks(embedding, query, limit = 15) {
  if (!dbAvailable) return [];

  const weights = classifyQueryIntent(query);
  const vectorStr = `[${embedding.join(',')}]`;
  const tsQuery = query.trim().split(/\s+/).join(' & ');

  console.log(`[HYBRID] Intent: "${weights.label}" | Weights → Vector:${weights.vector} Text:${weights.text} FTS:${weights.fullText}`);

  // Run all 3 layers in PARALLEL for zero added latency
  const [vectorRows, textRows, ftsRows] = await Promise.all([
    // Layer 1: Vector / Semantic similarity
    pool.query(
      `SELECT id, 1 - (embeddings <=> $1::vector) AS score
       FROM books
       WHERE embeddings IS NOT NULL
       ORDER BY embeddings <=> $1::vector
       LIMIT $2`,
      [vectorStr, limit * 3]
    ).then(r => r.rows).catch(() => []),

    // Layer 2: pg_trgm text match on title AND author
    // Use WHERE with % operator so the GIN index is used instead of a full table scan
    pool.query(
      `SELECT id, GREATEST(similarity(title, $1), similarity(author, $1)) AS score
       FROM books
       WHERE title % $1 OR author % $1
       ORDER BY GREATEST(similarity(title, $1), similarity(author, $1)) DESC
       LIMIT $2`,
      [query, limit * 3]
    ).then(r => r.rows).catch(() => []),

    // Layer 3: Postgres full-text search (ranked by ts_rank)
    pool.query(
      `SELECT id, ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS score
       FROM books
       WHERE search_vector @@ websearch_to_tsquery('english', $1)
       ORDER BY score DESC
       LIMIT $2`,
      [query, limit * 3]
    ).then(r => r.rows).catch(() => []),
  ]);

  // Normalize each layer's scores to [0, 1] range
  const normalize = (rows) => {
    if (rows.length === 0) return new Map();
    const maxScore = Math.max(...rows.map(r => parseFloat(r.score) || 0));
    if (maxScore === 0) return new Map();
    return new Map(rows.map(r => [r.id, (parseFloat(r.score) || 0) / maxScore]));
  };

  const vectorMap = normalize(vectorRows);
  const textMap = normalize(textRows);
  const ftsMap = normalize(ftsRows);

  // Collect all candidate book IDs across all three layers
  const allIds = new Set([...vectorMap.keys(), ...textMap.keys(), ...ftsMap.keys()]);

  // Calculate final weighted score for each candidate
  const scored = Array.from(allIds).map(id => ({
    id,
    finalScore:
      (vectorMap.get(id) || 0) * weights.vector +
      (textMap.get(id) || 0) * weights.text +
      (ftsMap.get(id) || 0) * weights.fullText,
    rawTextScore: textMap.get(id) || 0
  }));

  // Sort by final score descending, take top `limit`
  const topIdsWithScores = scored
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);

  if (topIdsWithScores.length === 0) return [];

  // Final Boost: If a book has a very high title similarity (exact match), 
  // we boost it towards 1.0 so it hits the "Legendary" UI thresholds.
  const boostedResults = topIdsWithScores.map(item => {
    let score = item.finalScore;
    // If it's a very strong title match, boost it to reflect 90%+ confidence
    if (item.rawTextScore >= 0.95) {
      score = Math.max(score, 0.98); // Exact match jackpot
    } else if (item.rawTextScore >= 0.85) {
      score = Math.max(score, 0.92); // Near-exact match
    }
    return { id: item.id, score };
  });

  const idList = boostedResults.map(r => r.id);
  const scoreById = new Map(boostedResults.map(r => [r.id, r.score]));

  const detailResult = await pool.query(
    `SELECT id, title, author, description, cover_image, info_link,
            average_rating, ratings_count, published_date, genres, page_count
     FROM books WHERE id = ANY($1)`,
    [idList]
  );


  return detailResult.rows
    .map(row => ({
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      coverImage: row.cover_image,
      infoLink: row.info_link,
      averageRating: row.average_rating,
      ratingsCount: row.ratings_count,
      publishedDate: row.published_date,
      categories: row.genres || [],
      pageCount: row.page_count,
      similarity: scoreById.get(row.id) || 0,
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

// Backward-compat alias — kept so nothing else breaks
async function searchSimilarBooks(embedding, limit = 10) {
  return hybridSearchBooks(embedding, '', limit);
}


/**
 * Store a book with its embedding in the database.
 */
async function storeBook(book, embedding) {
  if (!dbAvailable) return null;

  try {
    const dbId = book.isbn || book.id;
    const result = await pool.query(
      `INSERT INTO books (id, title, author, description, cover_image, info_link, embeddings, average_rating, ratings_count, published_date, genres, page_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         author = EXCLUDED.author,
         description = EXCLUDED.description,
         cover_image = EXCLUDED.cover_image,
         embeddings = EXCLUDED.embeddings,
         average_rating = EXCLUDED.average_rating,
         ratings_count = EXCLUDED.ratings_count,
         published_date = EXCLUDED.published_date,
         genres = EXCLUDED.genres,
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
async function searchTrendingBooks(limit = 15, offset = 0) {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, genres, page_count
       FROM books
       ORDER BY clicks DESC, last_clicked_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
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
      categories: row.genres || [],
      pageCount: row.page_count
    }));
  } catch (err) {
    console.error('Trending search error:', err.message);
    return [];
  }
}

/**
 * Fetch top trending books filtered by a specific genre.
 */
async function searchTrendingBooksByGenre(genre, limit = 30, offset = 0) {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, genres, page_count
       FROM books
       WHERE EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE '%' || $1 || '%')
       ORDER BY clicks DESC, last_clicked_at DESC
       LIMIT $2 OFFSET $3`,
      [genre, limit, offset]
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
      categories: row.genres || [],
      pageCount: row.page_count
    }));
  } catch (err) {
    console.error(`Trending genre search error (${genre}):`, err.message);
    return [];
  }
}

/**
 * Fetch books for a genre that have been featured the least.
 * Rotates through the database to keep the homepage fresh.
 */
async function getLeastFeaturedBooksByGenre(genre, limit = 15) {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, genres, page_count
       FROM books
       WHERE EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE '%' || $1 || '%')
       ORDER BY featured_count ASC, RANDOM()
       LIMIT $2`,
      [genre, limit]
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
      categories: row.genres || [],
      pageCount: row.page_count
    }));
  } catch (err) {
    console.error(`Error fetching least featured books for genre ${genre}:`, err.message);
    return [];
  }
}

/**
 * Fetch the most recently published books in the database.
 * Replaces the live "Just Announced" section.
 */
async function getRecentlyPublishedBooks(limit = 15) {
  if (!dbAvailable) return [];
  try {
    const result = await pool.query(
      `SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, genres, page_count
       FROM books
       WHERE published_date IS NOT NULL
       ORDER BY published_date DESC, featured_count ASC, RANDOM()
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
      categories: row.genres || [],
      pageCount: row.page_count
    }));
  } catch (err) {
    console.error('Error fetching recently published books:', err.message);
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
      'SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, genres, page_count FROM books WHERE id = $1',
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
      categories: row.genres || [],
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
    items.map(item => storeBook(item.book, item.embeddings || item.embedding).catch(() => null))
  );
  return results.filter(id => id !== null);
}

function isDatabaseAvailable() {
  return dbAvailable;
}

/**
 * Fetch a specific persisted featured section and its books.
 */
async function getPersistedFeaturedSections(limitPerSection = 15) {
  if (!dbAvailable) return null;
  try {
    const sectionsResult = await pool.query('SELECT TRIM(section_name) AS section_name, book_ids, updated_at FROM featured_sections');
    if (sectionsResult.rows.length === 0) return null;

    const populatedSections = [];
    for (const section of sectionsResult.rows) {
      if (section.book_ids && section.book_ids.length > 0) {
        // Only fetch the top X books for the homepage to stay fast
        const idsToFetch = section.book_ids.slice(0, limitPerSection);

        const booksResult = await pool.query(
          'SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, genres, page_count FROM books WHERE id = ANY($1)',
          [idsToFetch]
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
          categories: row.genres || [],
          pageCount: row.page_count
        }]));

        populatedSections.push({
          title: section.section_name,
          updatedAt: section.updated_at,
          books: idsToFetch.map(id => bookMap.get(id)).filter(b => b)
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
 * Fetch books from a specific featured section snapshot (paginated).
 */
async function getFeaturedSectionBooks(sectionName, limit = 30, offset = 0) {
  if (!dbAvailable) return [];
  try {
    const sectionResult = await pool.query(
      'SELECT book_ids FROM featured_sections WHERE LOWER(TRIM(section_name)) = LOWER(TRIM($1))',
      [sectionName]
    );

    if (sectionResult.rows.length === 0) return [];

    const allIds = sectionResult.rows[0].book_ids || [];
    const idsToFetch = allIds.slice(offset, offset + limit);

    if (idsToFetch.length === 0) return [];

    const booksResult = await pool.query(
      'SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, genres, page_count FROM books WHERE id = ANY($1)',
      [idsToFetch]
    );

    // Map and maintain original snapshot order
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
      categories: row.genres || [],
      pageCount: row.page_count
    }]));

    return idsToFetch.map(id => bookMap.get(id)).filter(b => b);
  } catch (err) {
    console.error(`Error fetching featured section books (${sectionName}):`, err.message);
    return [];
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
 * Returns { embedding, topResultIds }
 */
async function getCachedSearch(query) {
  if (!dbAvailable) return null;
  try {
    const res = await pool.query(
      'UPDATE search_cache SET usage_count = usage_count + 1, last_used_at = NOW() WHERE search_query = $1 RETURNING embeddings, top_result_ids, explanations',
      [query.toLowerCase().trim()]
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      let embedding = row.embeddings;
      const topResultIds = row.top_result_ids || null;
      const explanations = row.explanations || null;
      
      // If it's a string from the DB, clean and parse it.
      if (embedding && typeof embedding === 'string') {
        embedding = embedding.replace(/[\[\]]/g, '').split(',').map(Number);
      }
      return { embedding, topResultIds, explanations };
    }
    return null;
  } catch (err) {
    console.error('Cache hit error:', err.message);
    return null;
  }
}

/**
 * Save a search query and its embedding to the cache.
 * Can optionally store topResultIds to enable semantic short-circuiting.
 */
async function saveSearchToCache(query, embedding, topResultIds = null) {
  if (!dbAvailable || !embedding) return;
  try {
    const queryStr = query.toLowerCase().trim();
    const embeddingStr = `[${embedding.join(',')}]`;

    await pool.query(
      `INSERT INTO search_cache (search_query, embeddings, top_result_ids) 
       VALUES ($1, $2::vector, $3) 
       ON CONFLICT (search_query) 
       DO UPDATE SET 
         embeddings = EXCLUDED.embeddings,
         top_result_ids = COALESCE(EXCLUDED.top_result_ids, search_cache.top_result_ids)`,
      [queryStr, embeddingStr, topResultIds]
    );
  } catch (err) {
    console.error('Cache save error:', err.message);
  }
}

/**
 * Fetch a list of books by their IDs.
 */
async function getBooksByIds(ids) {
  if (!dbAvailable || !ids || ids.length === 0) return [];
  try {
    const result = await pool.query(
      'SELECT id, title, author, description, cover_image, info_link, average_rating, ratings_count, published_date, genres, page_count, embeddings FROM books WHERE id = ANY($1)',
      [ids]
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
      categories: row.genres || [],
      pageCount: row.page_count,
      embedding: row.embeddings
    }));
  } catch (err) {
    console.error('Get books by IDs error:', err.message);
    return [];
  }
}

/**
 * Save AI explanations to the search cache.
 */
async function saveExplanationsToCache(query, explanations) {
  if (!dbAvailable || !explanations) return;
  try {
    const queryStr = query.toLowerCase().trim();
    await pool.query(
      'UPDATE search_cache SET explanations = $1 WHERE search_query = $2',
      [JSON.stringify(explanations), queryStr]
    );
  } catch (err) {
    console.error('Cache explanations save error:', err.message);
  }
}

module.exports = {
  initDatabase,
  hybridSearchBooks,
  searchTrendingBooks,
  searchTrendingBooksByGenre,
  incrementBookClick,
  storeBooksBatch,
  storeBook,
  getBookById,
  getBooksByIds,
  saveFeaturedSection,
  getPersistedFeaturedSections,
  getLeastFeaturedBooksByGenre,
  getRecentlyPublishedBooks,
  isDatabaseAvailable,
  getCachedSearch,
  saveSearchToCache,
  saveExplanationsToCache,
  getFeaturedSectionBooks
};
