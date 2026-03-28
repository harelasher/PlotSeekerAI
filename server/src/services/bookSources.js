const axios = require('axios');

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Search Google Books API and normalize results.
 */
async function searchGoogleBooks(query, maxResults = 12, orderBy = 'relevance') {
  try {
    const fetchLimit = Math.max(maxResults, 40);
    const response = await axios.get(GOOGLE_BOOKS_API, {
      params: {
        q: query,
        maxResults: fetchLimit,
        printType: 'books',
        langRestrict: 'en',
        orderBy: orderBy,
      },
    });

    if (!response.data.items) return [];

    return response.data.items.map((item, index) => {
      const info = item.volumeInfo;
      const isbn = info.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier
        || info.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier
        || null;

      return {
        id: item.id,
        title: info.title || null,
        author: info.authors?.join(', ') || null,
        description: info.description || info.subtitle || null,
        coverImage: info.imageLinks?.thumbnail?.replace('http:', 'https:')
          || info.imageLinks?.smallThumbnail?.replace('http:', 'https:')
          || null,
        isbn,
        infoLink: info.infoLink || null,
        publishedDate: info.publishedDate || null,
        categories: info.categories || [],
        pageCount: info.pageCount || null,
        averageRating: info.averageRating || 0,
        ratingsCount: info.ratingsCount || 0,
        _relevanceIndex: index,
      };
    })
      .filter(book =>
        book.coverImage &&
        book.title &&
        book.author &&
        book.description && book.description.trim().length > 10
      );
  } catch (error) {
    console.error('Google Books API error:', error.message);
    return [];
  }
}

/**
 * Common ranking/sorting helper for book lists.
 */
function rankBooks(books, mode = 'hybrid', poolSize = 40) {
  return books.map(book => {
    const relevanceScore = (poolSize - (book._relevanceIndex || 0)) * 5;
    const popularityScore = (book.averageRating * Math.log10(book.ratingsCount + 1)) * 50;

    let totalScore = relevanceScore + popularityScore;
    if (mode === 'popularity') totalScore = popularityScore;

    return { ...book, _score: totalScore };
  })
    .sort((a, b) => b._score - a._score)
    .map(book => {
      const b = { ...book };
      delete b._score;
      delete b._relevanceIndex;
      return b;
    });
}

/**
 * Get a specific book by its Google Books volume ID.
 */
async function getGoogleBookById(volumeId) {
  try {
    const response = await axios.get(`${GOOGLE_BOOKS_API}/${volumeId}`);
    const info = response.data.volumeInfo;
    const isbn = info.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier
      || info.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier
      || null;

    return {
      id: response.data.id,
      title: info.title || 'Unknown Title',
      author: info.authors?.join(', ') || 'Unknown Author',
      description: info.description || '',
      coverImage: info.imageLinks?.large?.replace('http:', 'https:')
        || info.imageLinks?.medium?.replace('http:', 'https:')
        || info.imageLinks?.thumbnail?.replace('http:', 'https:')
        || null,
      isbn,
      infoLink: info.infoLink || null,
      publishedDate: info.publishedDate || null,
      categories: info.categories || [],
      pageCount: info.pageCount || null,
      averageRating: info.averageRating || 0,
      ratingsCount: info.ratingsCount || 0,
      publisher: info.publisher || null,
    };
  } catch (error) {
    console.error('Google Books get by ID error:', error.message);
    return null;
  }
}

let featuredBooksCache = null;
let lastFeaturedFetch = 0;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 Hour for general sections

let justAnnouncedCache = null;
let lastJustAnnouncedFetch = 0;
const JUST_ANNOUNCED_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 Days

/**
 * Fetch strictly recent books (last 30 days) for the Just Announced section.
 * This has its own weekly cache separate from the homepage sections.
 */
async function fetchJustAnnouncedBooks() {
  if (justAnnouncedCache && (Date.now() - lastJustAnnouncedFetch < JUST_ANNOUNCED_CACHE_TTL_MS)) {
    return justAnnouncedCache;
  }

  const now = new Date();
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(now.getMonth() - 1);

  // Build a date-range query that Google Books API actually understands
  // Format: YYYY-MM-DD
  const formatDate = (d) => d.toISOString().split('T')[0];
  const afterDate = formatDate(oneMonthAgo);

  // Query Google with date constraints built into the query string
  const genreQueries = [
    `subject:fiction+after:${afterDate}`,
    `subject:fantasy+after:${afterDate}`,
    `subject:thriller+after:${afterDate}`,
    `subject:romance+after:${afterDate}`,
  ];

  let pool = [];
  for (const q of genreQueries) {
    const results = await searchGoogleBooks(q, 40, 'newest');
    pool.push(...results);
    await new Promise(r => setTimeout(r, 150));
  }

  // Deduplicate by book ID
  const uniquePool = Array.from(new Map(pool.map(b => [b.id, b])).values());

  // Strictly filter to only the past 1 month — no exceptions, no fallback to older books
  const strictly = uniquePool.filter(book => {
    if (!book.publishedDate) return false;
    let dateStr = String(book.publishedDate);
    // Handle bare year (e.g. "2023") → treat as Jan 1st of that year
    if (/^\d{4}$/.test(dateStr)) dateStr = `${dateStr}-01-01`;
    // Handle year-month (e.g. "2024-03") → treat as 1st of that month
    if (/^\d{4}-\d{2}$/.test(dateStr)) dateStr = `${dateStr}-01`;
    const pDate = new Date(dateStr);
    if (isNaN(pDate.getTime())) return false;
    // Must be within the last 30 days only
    return pDate >= oneMonthAgo && pDate <= now;
  });

  // Sort by popularity within the date window
  const books = rankBooks(strictly, 'popularity', uniquePool.length).slice(0, 15);

  if (books.length > 0) {
    justAnnouncedCache = books;
    lastJustAnnouncedFetch = Date.now();
  }

  return books;
}

/**
 * Get featured/trending books for the homepage with Server-Side caching.
 */
async function getFeaturedBooks() {
  // If we have a fresh cache, immediately return it (0ms response time!)
  if (featuredBooksCache && (Date.now() - lastFeaturedFetch < CACHE_TTL_MS)) {
    return featuredBooksCache;
  }
  const categories = [
    { name: 'Trending Now', query: 'subject:fiction', orderBy: 'newest' },
    { name: 'Just Announced', query: 'subject:fantasy', orderBy: 'newest' },
    { name: 'Self Improvement', query: 'subject:"Self-Help"' },
    { name: 'Science Fiction', query: 'subject:"Science Fiction"' },
    { name: 'Mystery & Thriller', query: 'subject:"Thriller"' },
    { name: 'Historical Fiction', query: 'subject:"Historical Fiction"' },
    { name: 'Fantasy Epics', query: 'subject:"Fantasy"' },
  ];

  const { searchTrendingBooks, isDatabaseAvailable } = require('./database');
  const sections = [];

  // Calculate the acceptable date range for "Just Announced" (Current Month +- 1 month)
  const now = new Date();
  const oneMonthAgo = new Date(); oneMonthAgo.setMonth(now.getMonth() - 1);
  const oneMonthFuture = new Date(); oneMonthFuture.setMonth(now.getMonth() + 1);

  // Calculate date range for "Trending Now" (Last 6 months) fallback
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(now.getMonth() - 6);

  for (const cat of categories) {
    let books = [];

    if (cat.name === 'Trending Now') {
      // Priority: Database Click Trends
      if (isDatabaseAvailable()) {
        books = await searchTrendingBooks(15);
      }
      // Fallback: Recent highly rated books from Google
      if (books.length < 5) {
        const pool = await searchGoogleBooks(cat.query, 40, 'newest');
        const recent = pool.filter(book => {
          if (!book.publishedDate) return false;
          const pDate = new Date(book.publishedDate);
          return pDate >= sixMonthsAgo;
        });
        const ranked = rankBooks(recent, 'hybrid', 40);
        books = [...books, ...ranked].slice(0, 15);
      }
    } else if (cat.name === 'Just Announced') {
      // Delegate to the dedicated weekly-cached fetcher
      books = await fetchJustAnnouncedBooks();
    } else {
      const pool = await searchGoogleBooks(cat.query, 15, cat.orderBy || 'relevance');
      books = rankBooks(pool, 'hybrid', 15);
    }

    if (books.length > 0) {
      sections.push({
        title: cat.name,
        books,
      });
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Save successful fetch to memory cache
  if (sections.length > 0) {
    featuredBooksCache = sections;
    lastFeaturedFetch = Date.now();
  }

  return sections;
}

// Pre-warm the cache purely in the background when the server starts!
// This guarantees the very first immediate page load for a user is already cached.
setTimeout(() => {
  getFeaturedBooks().catch(e => console.error('Cache pre-warm failed:', e.message));
}, 1000);

/**
 * Advanced search that uses Promise.all to bypass the 40 result limit and fetch top X books.
 */
async function searchGoogleBooksPaginated(query, totalResults = 50, orderBy = 'relevance') {
  try {
    const numRequests = Math.ceil(totalResults / 40) + 1; // Usually 2 requests = 80 books

    let startIndex = 0;
    const allItems = [];
    for (let i = 0; i < numRequests; i++) {
      try {
        const res = await axios.get(GOOGLE_BOOKS_API, {
          params: {
            q: query,
            maxResults: 40,
            startIndex: startIndex,
            printType: 'books',
            langRestrict: 'en',
            orderBy: orderBy,
          },
        });
        if (res.data && res.data.items) {
          allItems.push(...res.data.items);
        }
      } catch (err) {
        console.error('Paginated fetch error:', err.message);
      }
      startIndex += 40;
      // Pacing
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (allItems.length === 0) return [];

    // Deduplicate by ID
    const uniqueItems = [];
    const seenIds = new Set();
    for (const item of allItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniqueItems.push(item);
      }
    }

    return uniqueItems.map((item) => {
      const info = item.volumeInfo;
      const isbn = info.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier
        || info.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier
        || null;

      return {
        id: item.id,
        title: info.title || 'Unknown Title',
        author: info.authors?.join(', ') || 'Unknown Author',
        description: info.description || info.subtitle || '',
        coverImage: info.imageLinks?.thumbnail?.replace('http:', 'https:')
          || info.imageLinks?.smallThumbnail?.replace('http:', 'https:')
          || null,
        isbn,
        infoLink: info.infoLink || null,
        publishedDate: info.publishedDate || null,
        categories: info.categories || [],
        pageCount: info.pageCount || null,
        averageRating: info.averageRating || 0,
        ratingsCount: info.ratingsCount || 0,
      };
    })
      .filter(book =>
        book.coverImage &&
        book.title !== 'Unknown Title' &&
        book.author !== 'Unknown Author' &&
        book.description.trim().length > 0
      )
      .map((book, index) => {
        // Hybrid scoring
        const relevanceScore = (100 - index) * 5;
        const popularityScore = (book.averageRating * book.ratingsCount) * 0.1;
        return { ...book, _score: relevanceScore + popularityScore };
      })
      .sort((a, b) => b._score - a._score)
      .map(book => {
        delete book._score;
        return book;
      })
      .slice(0, totalResults);

  } catch (error) {
    console.error('Google Books Paginated error:', error.message);
    return [];
  }
}

module.exports = { searchGoogleBooks, getGoogleBookById, getFeaturedBooks, searchGoogleBooksPaginated };
