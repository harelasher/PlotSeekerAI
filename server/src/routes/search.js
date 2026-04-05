/**
 * search.js
 * Main API router for PlotSeekerAI search, browse, and book details.
 * Implements the hybrid 3-layer search logic (Vector + Trigram + FTS).
 */
const express = require('express');
const router = express.Router();
const { generateEmbedding, generateBookExplanations } = require('../services/openai');
const { searchGoogleBooks, getGoogleBookById, getFeaturedBooks, searchGoogleBooksPaginated } = require('../services/bookSources');
const {
  hybridSearchBooks,
  searchSimilarBooks,
  searchTrendingBooks,
  searchTrendingBooksByGenre,
  incrementBookClick,
  storeBooksBatch,
  getBookById,
  getBooksByIds,
  isDatabaseAvailable,
  getCachedSearch,
  saveSearchToCache,
  getFeaturedSectionBooks
} = require('../services/database');
const { generateAffiliateLink } = require('../utils/affiliateLink');

/**
 * POST /api/search
 * Main RAG search endpoint.
 * Body: { query: string, dislikedIds?: string[] }
 */
router.post('/search', async (req, res, next) => {
  try {
    const { query, dislikedIds = [] } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    let books = [];
    let embedding = null;

    // Step 1: Try vector search if DB is available
    if (isDatabaseAvailable()) {
      try {
        // Attempt to retrieve cached embedding AND top results first
        const cache = await getCachedSearch(query);
        embedding = cache?.embedding;
        const cachedIds = cache?.topResultIds;
        const cachedExplanations = cache?.explanations;

        // SHORT-CIRCUIT: If we have cached result IDs, bypass everything else
        if (cachedIds && cachedIds.length > 0) {
          console.log(`[CACHE] Semantic Hot-Reload! Bypassing vector math for familiar query: "${query}"`);
          const rows = await getBooksByIds(cachedIds);
          
          // Maintain the order from the cache
          const bookMap = new Map(rows.map(r => [r.id, r]));
          books = cachedIds.map(id => {
            const row = bookMap.get(id);
            if (!row) return null;
            return {
              ...row,
              similarity: 0.99, // Cached results are effectively 100% legacy matches
            };
          }).filter(b => b !== null);
          
          if (books.length > 0) {
            // Found results, stop looking
            // If we also have cached explanations, attach them directly to the results
            if (cachedExplanations && Array.isArray(cachedExplanations)) {
              const expMap = new Map(cachedExplanations.map(e => [e.title?.toLowerCase(), e]));
              books = books.map(b => {
                const exp = expMap.get(b.title?.toLowerCase());
                if (!exp) return b;
                return {
                  ...b,
                  summary: exp.summary || b.summary,
                  whyMatch: exp.whyMatch || b.whyMatch
                };
              });
            }
          }
        }

        if (books.length === 0) {
          // If not found in cache or cache was empty, generate it using AI ONLY if needed
          if (!embedding && process.env.OPENAI_API_KEY) {
            embedding = await generateEmbedding(query);
            if (embedding) {
              await saveSearchToCache(query, embedding);
            }
          }

          if (embedding) {
            const rawBooks = await hybridSearchBooks(embedding, query, 15);
            console.log(`[SEARCH DEBUG] Query: "${query}". Found ${rawBooks.length} hybrid matches.`);
            
            // Threshold of 0.30 is appropriate for the composite 3-layer score
            books = rawBooks.filter(book => book.similarity >= 0.30);
            
            // CACHE THE WINNERS: Save all IDs back to the semantic cache for next time
            if (books.length > 0) {
              const allFoundIds = books.map(b => String(b.id));
              await saveSearchToCache(query, embedding, allFoundIds);
            }
          }
        }
      } catch (err) {
        console.warn('Vector cache search failed, falling back to API:', err.message);
      }
    }

    // Step 4: [JIT LIBRARY EXPANSION]
    // Trigger if top results are weak (< 55% similarity) and OpenAI is enabled.
    const maxSimilarity = books.length > 0 ? books[0].similarity : 0;
    
    if (maxSimilarity < 0.55 && process.env.OPENAI_API_KEY) {
      console.log(`[JIT] Weak match confidence (${(maxSimilarity * 100).toFixed(1)}%). Triggering Library Expansion for: "${query}"`);
      
      try {
        const { generateSearchKeywords, generateBatchEmbeddings } = require('../services/openai');

        // 1. Semantic Translation (Vibe -> Keywords)
        const keywords = await generateSearchKeywords(query);
        console.log(`[JIT] Vibe translated to keywords: "${keywords}"`);

        // 2. External Net (Google)
        const externalBooks = await searchGoogleBooks(keywords, 15);
        
        if (externalBooks.length > 0) {
          // Refresh embedding from cache if it was somehow lost, but we usually have it by now
          if (!embedding) {
            const cache = await getCachedSearch(query);
            embedding = cache?.embedding;
          }
          
          if (!embedding) embedding = await generateEmbedding(query);

          // 3. Resource-Aware Optimization: Check DB for existing books first
          const externalIds = externalBooks.map(b => String(b.isbn || b.id));
          
          // Fetch existing books that are ALREADY in the DB
          const existingInDb = await getBooksByIds(externalIds);
          
          const existingIdSet = new Set(existingInDb.map(b => String(b.id)));
          const booksToEmbed = externalBooks.filter(b => !existingIdSet.has(String(b.isbn || b.id)));
          
          console.log(`[JIT] Analysis: Found ${existingInDb.length} familiar books and ${booksToEmbed.length} truly NEW books.`);

          let allJitCandidates = [];

          // 4. Vectorize ONLY truly new books
          if (booksToEmbed.length > 0) {
            const texts = booksToEmbed.map(b => `${b.title} ${b.description}`.substring(0, 8000));
            const newEmbeddings = await generateBatchEmbeddings(texts);
            
            const newlyVectorized = booksToEmbed.map((book, i) => ({
              ...book,
              id: book.isbn || book.id,
              embeddings: newEmbeddings[i],
              similarity: (newEmbeddings[i] && embedding) 
                ? newEmbeddings[i].reduce((sum, val, idx) => sum + val * (embedding[idx] || 0), 0) 
                : 0,
              isJitResult: true
            }));

            allJitCandidates.push(...newlyVectorized);

            // SAVE ALL: Even if they don't match this search, they might match a future one.
            // Note: We use the plural key 'embeddings' to match the database logic
            const itemsToSave = newlyVectorized.map(b => ({ book: b, embeddings: b.embeddings }));
            storeBooksBatch(itemsToSave).catch(err => console.error('[JIT] Background save failed:', err.message));
          }

          // 5. Use existing vectors for familiar books (no AI cost)
          if (existingInDb.length > 0) {
            const processedExisting = existingInDb.map(row => {
              // Ensure we handle both string and array formats from the DB
              const rowVector = typeof row.embeddings === 'string' 
                ? row.embeddings.replace(/[\[\]]/g, '').split(',').map(Number) 
                : row.embeddings;
              
              const score = (rowVector && embedding) 
                ? rowVector.reduce((sum, val, idx) => sum + val * (embedding[idx] || 0), 0) 
                : 0;
              
              return {
                id: row.id,
                title: row.title,
                author: row.author,
                description: row.description,
                coverImage: row.cover_image,
                categories: row.genres || [],
                pageCount: row.page_count,
                averageRating: row.average_rating,
                publishedDate: row.published_date,
                similarity: score,
                isJitResult: true
              };
            });
            allJitCandidates.push(...processedExisting);
          }

          // 6. Final curation: only show the ones that actually fit the vibe
          const relevantNewMatches = allJitCandidates.filter(b => b && b.similarity > 0.40);
          console.log(`[JIT] Vibe check complete. Found ${relevantNewMatches.length} relevant matches.`);

          const existingIdsInResult = new Set(books.map(b => String(b.id)));
          const uniqueNewResults = relevantNewMatches.filter(b => !existingIdsInResult.has(String(b.id)));
          
          books = [...books, ...uniqueNewResults].sort((a, b) => b.similarity - a.similarity);
        }
      } catch (jitErr) {
        console.error('[JIT ERROR]:', jitErr.message);
      }
    }

    // Step 5: Filter out disliked books
    if (dislikedIds.length > 0) {
      const dislikedSet = new Set(dislikedIds);
      books = books.filter(b => !dislikedSet.has(String(b.id)));
    }

    // Limit to top 12
    books = books.slice(0, 12);


    // Step 6: Final result mapping
    const results = books.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      coverImage: book.coverImage,
      summary: book.summary || (book.description ? book.description.substring(0, 200) : ''),
      whyMatch: book.whyMatch || '',
      matchScore: book.similarity ? `${Math.round(book.similarity * 100)}% Match` : null,
      similarity: book.similarity,
      affiliateLink: generateAffiliateLink(book),
      publishedDate: book.publishedDate,
      categories: book.categories,
      pageCount: book.pageCount,
      averageRating: book.averageRating,
      isNew: book.isJitResult || false
    }));

    res.json({ books: results });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/search/explain
 * Called AFTER results are shown — generates AI "Why this matches" text.
 * Body: { query: string, books: [{ id, title, author, description }] }
 */
router.post('/search/explain', async (req, res, next) => {
  try {
    const { query, books } = req.body;
    if (!query || !books || books.length === 0) {
      return res.status(400).json({ error: 'Query and books are required.' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ explanations: [] });
    }

    // Attempt to retrieve from cache first
    const cache = await getCachedSearch(query);
    if (cache?.explanations) {
      console.log(`[CACHE] Returning cached AI explanations for: "${query}"`);
      return res.json({ explanations: cache.explanations });
    }

    const explanations = await generateBookExplanations(query, books);

    // Save to cache for next time
    if (explanations && explanations.length > 0) {
      const { saveExplanationsToCache } = require('../services/database');
      await saveExplanationsToCache(query, explanations);
    }

    res.json({ explanations });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/books/featured
 * Returns featured book sections for the homepage.
 */
router.get('/books/featured', async (req, res, next) => {
  try {
    const rawSections = await getFeaturedBooks();
    
    // Ensure all books in all sections have affiliate links
    const sections = rawSections.map(section => ({
      ...section,
      books: (section.books || []).map(book => ({
        ...book,
        affiliateLink: generateAffiliateLink(book)
      }))
    }));
    
    res.json({ sections });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/books/featured/refresh
 * Manually trigger a background refresh of featured sections (Admin/Internal use).
 */
router.post('/books/featured/refresh', async (req, res, next) => {
  try {
    const { refreshFeaturedSectionsBackground } = require('../services/bookSources');
    // Trigger in background
    refreshFeaturedSectionsBackground();
    res.json({ message: 'Background refresh triggered successfully.' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/books/browse
 * Fetches top 50 popular books.
 */
router.get('/books/browse', async (req, res, next) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = 50;
    const books = await searchTrendingBooks(limit, offset);
    const enrichedBooks = books.map(book => ({
      ...book,
      summary: book.description ? book.description.substring(0, 200) : '',
      affiliateLink: generateAffiliateLink(book),
    }));
    res.json({ books: enrichedBooks });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/books/category/:categoryId
 * Fetches top 30 in a specific category.
 */
router.get('/books/category/:sectionName', async (req, res, next) => {
  try {
    const { sectionName } = req.params;
    const offset = parseInt(req.query.offset) || 0;
    const limit = 30;

    // 1. Try to fetch from Curated Snapshot first (180 books pool)
    let books = await getFeaturedSectionBooks(sectionName, limit, offset);

    // 2. Fallback to generic genre search if no snapshot exists for this name
    if (books.length === 0 && offset === 0) {
      // Use our simplified mapping to hit DB genres
      const genreMap = {
        'Trending Now': null, // Falls back to global trending
        'Just Announced': null, // Falls back to global trending for now
        'Self Improvement': 'Self',
        'Science Fiction': 'Science Fiction',
        'Mystery & Thriller': 'Mystery',
        'Historical Fiction': 'Historical',
        'Fantasy Epics': 'Fantasy'
      };

      const targetGenre = genreMap[sectionName];
      if (targetGenre) {
        books = await searchTrendingBooksByGenre(targetGenre, limit, offset);
      } else {
        books = await searchTrendingBooks(limit, offset);
      }
    }

    const enrichedBooks = books.map(book => ({
      ...book,
      summary: book.description ? book.description.substring(0, 200) : '',
      affiliateLink: generateAffiliateLink(book),
    }));
    res.json({ books: enrichedBooks });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/books/:id/click
 * Records a click for trending analysis.
 */
router.post('/books/:id/click', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (isDatabaseAvailable()) {
      // DB IDs are ASINs (alphanumeric 10) or ISBNs (numeric 10/13).
      if (/^[a-zA-Z0-9]+$/.test(id) && (id.length === 10 || id.length === 13)) {
        await incrementBookClick(id);
      }
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/books/:id
 * Get full book details by ID (tries DB first, then Google Books API).
 */
router.get('/books/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    let book = null;

    // Try DB first (IDs are ISBNs or ASINs, exactly 10 or 13 length alphanumeric)
    if (/^[a-zA-Z0-9]+$/.test(id) && (id.length === 10 || id.length === 13)) {
      book = await getBookById(id);
    }

    // [DISABLED] Google Books API fallback
    // if (!book) {
    //   book = await getGoogleBookById(id);
    // }

    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    book.affiliateLink = generateAffiliateLink(book);
    res.json({ book });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
