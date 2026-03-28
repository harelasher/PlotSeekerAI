const express = require('express');
const router = express.Router();
const { generateEmbedding, generateBatchEmbeddings, generateBookExplanations } = require('../services/openai');
const { searchGoogleBooks, getGoogleBookById, getFeaturedBooks, searchGoogleBooksPaginated } = require('../services/bookSources');
const { 
  searchSimilarBooks, 
  searchTrendingBooks, 
  incrementBookClick, 
  storeBook, 
  storeBooksBatch, 
  getBookById, 
  isDatabaseAvailable 
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
    if (isDatabaseAvailable() && process.env.OPENAI_API_KEY) {
      try {
        const embedding = await generateEmbedding(query);
        books = await searchSimilarBooks(embedding, 15);
      } catch (err) {
        console.warn('Vector search failed, falling back to API:', err.message);
      }
    }

    // Step 2: If not enough results, fetch from Google Books
    if (books.length < 8) {
      const apiBooks = await searchGoogleBooks(query, 24); // Aggressive harvesting

      // Merge: avoid duplicates by ISBN/title
      const existingTitles = new Set(books.map(b => b.title.toLowerCase()));
      const toStore = [];

      for (const book of apiBooks) {
        if (!existingTitles.has(book.title.toLowerCase())) {
          books.push(book);
          existingTitles.add(book.title.toLowerCase());

          // Queue for batch embedding
          if (isDatabaseAvailable() && process.env.OPENAI_API_KEY && book.description) {
            toStore.push(book);
          }
        }
      }

      // Proactively store all newly found books in the database (Batch)
      if (toStore.length > 0) {
        // We do this in the background to not block the current search response
        (async () => {
          try {
            console.log(`Harvesting ${toStore.length} new books for query: ${query}`);
            const texts = toStore.map(b => `${b.title} by ${b.author}. ${b.description}`);
            const embeddings = await generateBatchEmbeddings(texts);
            
            const storeItems = toStore.map((book, i) => ({
              book,
              embedding: embeddings[i]
            })).filter(item => item.embedding);

            await storeBooksBatch(storeItems);
          } catch (err) {
            console.warn('Background harvesting failed:', err.message);
          }
        })();
      }
    }

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
        isbn: book.isbn,
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
 * GET /api/books/browse
 * Fetches top 50 popular books.
 */
router.get('/books/browse', async (req, res, next) => {
  try {
    const books = await searchGoogleBooksPaginated('subject:fiction OR subject:non-fiction', 50);
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

    if (categoryId === 'Trending Now') {
      books = await searchTrendingBooks(30);
    } else if (categoryId === 'Just Announced') {
      const now = new Date();
      const oneMonthAgo = new Date(); oneMonthAgo.setMonth(now.getMonth() - 1);
      const oneMonthFuture = new Date(); oneMonthFuture.setMonth(now.getMonth() + 1);

      const pool = await searchGoogleBooksPaginated(mapping.query, 60, mapping.orderBy);
      const filtered = pool.filter(book => {
        if (!book.publishedDate) return false;
        let dateToTest = String(book.publishedDate);
        if (/^\d{4}$/.test(dateToTest)) dateToTest = `${dateToTest}-01-01`;
        const pDate = new Date(dateToTest);
        return !isNaN(pDate.getTime()) && pDate >= oneMonthAgo && pDate <= oneMonthFuture;
      });
      // Import rankBooks from bookSources.js? We need to export it.
      // For now, simple sort if we don't have rankBooks here
      books = filtered.sort((a,b) => (b.ratingsCount * b.averageRating) - (a.ratingsCount * a.averageRating));
    } else {
      books = await searchGoogleBooksPaginated(mapping.query, 30, mapping.orderBy);
    }

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
      // If it's a numeric ID, it's our DB ID. 
      // If it's a string, it might be a Google ID. We only track clicks for books we've stored.
      if (/^\d+$/.test(id)) {
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

    // Try DB first, but only if the ID is a valid Postgres integer (Google IDs are mixed strings)
    if (/^\d+$/.test(id)) {
      book = await getBookById(id);
    }

    // Fallback to Google Books API (id might be a Google Books volume ID)
    if (!book) {
      book = await getGoogleBookById(id);
    }

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
