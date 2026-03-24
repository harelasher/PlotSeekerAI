const express = require('express');
const router = express.Router();
const { generateEmbedding, generateBookExplanations } = require('../services/openai');
const { searchGoogleBooks, getGoogleBookById, getFeaturedBooks } = require('../services/bookSources');
const { searchSimilarBooks, storeBook, getBookById, isDatabaseAvailable } = require('../services/database');
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
      const apiBooks = await searchGoogleBooks(query, 12);
      
      // Merge: avoid duplicates by ISBN/title
      const existingTitles = new Set(books.map(b => b.title.toLowerCase()));
      for (const book of apiBooks) {
        if (!existingTitles.has(book.title.toLowerCase())) {
          books.push(book);
          existingTitles.add(book.title.toLowerCase());

          // Optionally store in DB for future vector searches
          if (isDatabaseAvailable() && process.env.OPENAI_API_KEY && book.description) {
            try {
              const embedding = await generateEmbedding(
                `${book.title} by ${book.author}. ${book.description}`
              );
              await storeBook(book, embedding);
            } catch (err) {
              // Non-critical — just skip storing
            }
          }
        }
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
        whyMatch: explanation.whyMatch || 'Matches your search query.',
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
 * GET /api/books/:id
 * Get full book details by ID (tries DB first, then Google Books API).
 */
router.get('/books/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try database first
    let book = await getBookById(id);

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
