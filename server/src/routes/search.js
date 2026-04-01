const express = require('express');
const router = express.Router();
const { generateEmbedding, generateBookExplanations } = require('../services/openai');
const { searchGoogleBooks, getGoogleBookById, getFeaturedBooks, searchGoogleBooksPaginated } = require('../services/bookSources');
const { 
  searchSimilarBooks, 
  searchTrendingBooks, 
  incrementBookClick, 
  storeBooksBatch, 
  getBookById, 
  isDatabaseAvailable,
  getCachedSearch,
  saveSearchToCache
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

    // Step 1: Try vector search if DB is available
    if (isDatabaseAvailable()) {
      try {
        // Attempt to retrieve pre-calculated embedding from cache first
        let embedding = await getCachedSearch(query);

        // If not found, generate it using AI ONLY if needed
        if (!embedding && process.env.OPENAI_API_KEY) {
          embedding = await generateEmbedding(query);
          if (embedding) {
            await saveSearchToCache(query, embedding);
          }
        }

        if (embedding) {
          books = await searchSimilarBooks(embedding, 15);
        }
      } catch (err) {
        console.warn('Vector cache search failed, falling back to API:', err.message);
      }
    }

    // Step 2: [DISABLED] Google Books API fallback is commented out — DB-only mode
    // if (books.length < 8) {
    //   const apiBooks = await searchGoogleBooks(query, 24);
    //   const existingTitles = new Set(books.map(b => b.title.toLowerCase()));
    //   for (const book of apiBooks) {
    //     if (!existingTitles.has(book.title.toLowerCase())) {
    //       books.push(book);
    //       existingTitles.add(book.title.toLowerCase());
    //     }
    //   }
    // }

    // Step 3: Filter out disliked books
    if (dislikedIds.length > 0) {
      const dislikedSet = new Set(dislikedIds);
      books = books.filter(b => !dislikedSet.has(String(b.id)));
    }

    // Limit to top 12
    books = books.slice(0, 12);

    // Step 4: Generate AI explanations if OpenAI is configured
    let explanations = [];
    if (process.env.OPENAI_API_KEY && books.length > 0) {
      try {
        explanations = await generateBookExplanations(query, books);
      } catch (err) {
        console.warn('AI explanation generation failed:', err.message);
      }
    }

    // Step 5: Merge explanations with books and add affiliate links
    const results = books.map((book, i) => {
      const explanation = explanations.find(
        e => e.title.toLowerCase() === book.title.toLowerCase()
      ) || explanations[i] || {};

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        description: book.description,
        coverImage: book.coverImage,
        summary: explanation.summary || (book.description ? book.description.substring(0, 200) : ''),
        whyMatch: explanation.whyMatch || '',
        affiliateLink: generateAffiliateLink(book),
        publishedDate: book.publishedDate,
        categories: book.categories,
        pageCount: book.pageCount,
        averageRating: book.averageRating,
      };
    });

    res.json({ books: results });
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
    const sections = await getFeaturedBooks();

    // Add affiliate links to all books
    const enrichedSections = sections.map(section => ({
      ...section,
      books: section.books.map(book => ({
        ...book,
        affiliateLink: generateAffiliateLink(book),
      })),
    }));

    res.json({ sections: enrichedSections });
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
    // [DISABLED] Google API — using DB trending data instead
    // const books = await searchGoogleBooksPaginated('subject:fiction OR subject:non-fiction', 50);
    const books = await searchTrendingBooks(50);
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
router.get('/books/category/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    
    // Map custom category strings to actual Google Books API queries
    const categoryMap = {
      'Trending Now': { query: 'subject:fiction', orderBy: 'newest' },
      'Just Announced': { query: 'subject:fantasy', orderBy: 'newest' },
      'Self Improvement': { query: 'subject:"Self-Help"', orderBy: 'relevance' },
      'Science Fiction': { query: 'subject:"Science Fiction"', orderBy: 'relevance' },
      'Mystery & Thriller': { query: 'subject:"Thriller"', orderBy: 'relevance' },
      'Historical Fiction': { query: 'subject:"Historical Fiction"', orderBy: 'relevance' },
      'Fantasy Epics': { query: 'subject:"Fantasy"', orderBy: 'relevance' },
    };
    
    const mapping = categoryMap[categoryId] || { query: `subject:"${categoryId}"`, orderBy: 'relevance' };
    
    let books = [];

    // [DISABLED] Google API — all categories use DB trending data for now
    // if (categoryId === 'Just Announced') {
    //   const pool = await searchGoogleBooksPaginated(mapping.query, 60, mapping.orderBy);
    //   ...
    // } else {
    //   books = await searchGoogleBooksPaginated(mapping.query, 30, mapping.orderBy);
    // }
    books = await searchTrendingBooks(30);

    const enrichedBooks = books.slice(0, 30).map(book => ({
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
