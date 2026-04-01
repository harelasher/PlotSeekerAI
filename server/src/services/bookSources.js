const axios = require('axios');
const { generateBatchEmbeddings } = require('./openai');

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Search Google Books API and normalize results.
 * [DISABLED] Google API calls are commented out — using DB-only mode.
 */
async function searchGoogleBooks(query, maxResults = 12, orderBy = 'relevance') {
  // const fetchLimit = Math.max(maxResults, 40);
  // let attempts = 3;
  // 
  // while (attempts > 0) {
  //   try {
  //     const response = await axios.get(GOOGLE_BOOKS_API, {
  //       params: {
  //         q: query,
  //         maxResults: fetchLimit,
  //         printType: 'books',
  //         langRestrict: 'en',
  //         orderBy: orderBy,
  //         key: process.env.GOOGLE_BOOKS_API_KEY,
  //       },
  //     });
  //
  //     if (!response.data.items) return [];
  //     
  //     const normalized = response.data.items.map((item, index) => {
  //       const info = item.volumeInfo;
  //       const isbn = info.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier
  //         || info.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier
  //         || null;
  //
  //       return {
  //         id: item.id,
  //         title: info.title || null,
  //         author: info.authors?.join(', ') || null,
  //         description: info.description || info.subtitle || null,
  //         coverImage: info.imageLinks?.thumbnail?.replace('http:', 'https:')
  //           || info.imageLinks?.smallThumbnail?.replace('http:', 'https:')
  //           || null,
  //         isbn,
  //         infoLink: info.infoLink || null,
  //         publishedDate: info.publishedDate || null,
  //         categories: info.categories || [],
  //         pageCount: info.pageCount || null,
  //         averageRating: info.averageRating || 0,
  //         ratingsCount: info.ratingsCount || 0,
  //         _relevanceIndex: index,
  //       };
  //     });
  //
  //     return normalized.filter(book =>
  //       book.coverImage &&
  //       book.title &&
  //       book.author &&
  //       book.description && book.description.trim().length > 10 &&
  //       book.publishedDate &&
  //       book.categories && book.categories.length > 0 &&
  //       book.pageCount
  //     );
  //   } catch (error) {
  //     attempts--;
  //     console.error(`Google Books API attempt failed (${3 - attempts}/3):`, error.message);
  //     if (attempts === 0) return [];
  //     await new Promise(r => setTimeout(r, 1000));
  //   }
  // }
  return [];
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
 * [DISABLED] Google API calls are commented out — using DB-only mode.
 */
async function getGoogleBookById(volumeId) {
  // try {
  //   const response = await axios.get(`${GOOGLE_BOOKS_API}/${volumeId}`, {
  //     params: {
  //       key: process.env.GOOGLE_BOOKS_API_KEY,
  //     },
  //   });
  //   const info = response.data.volumeInfo;
  //   const isbn = info.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier
  //     || info.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier
  //     || null;
  //
  //   return {
  //     id: response.data.id,
  //     title: info.title || 'Unknown Title',
  //     author: info.authors?.join(', ') || 'Unknown Author',
  //     description: info.description || '',
  //     coverImage: info.imageLinks?.large?.replace('http:', 'https:')
  //       || info.imageLinks?.medium?.replace('http:', 'https:')
  //       || info.imageLinks?.thumbnail?.replace('http:', 'https:')
  //       || null,
  //     isbn,
  //     infoLink: info.infoLink || null,
  //     publishedDate: info.publishedDate || null,
  //     categories: info.categories || [],
  //     pageCount: info.pageCount || null,
  //     averageRating: info.averageRating || 0,
  //     ratingsCount: info.ratingsCount || 0,
  //     publisher: info.publisher || null,
  //   };
  // } catch (error) {
  //   console.error('Google Books get by ID error:', error.message);
  //   return null;
  // }
  return null;
}

/**
 * Fetch recent books for the Just Announced section.
 * [DISABLED] Google API calls are commented out — returns empty array.
 * TODO: Re-enable once Google API is stable or build a DB-only version.
 */
async function AnnouncedBooks() {
  // const now = new Date();
  // const threeMonthsAgo = new Date();
  // threeMonthsAgo.setMonth(now.getMonth() - 3);
  // const sixMonthsAgo = new Date();
  // sixMonthsAgo.setMonth(now.getMonth() - 6);
  //
  // const genres = ['fiction', 'fantasy', 'thriller', 'romance', 'mystery', 'horror'];
  // let pool = [];
  //
  // for (const genre of genres) {
  //   const results = await searchGoogleBooks(`subject:${genre}`, 40, 'newest');
  //   pool.push(...results);
  //   await new Promise(r => setTimeout(r, 200)); 
  // }
  //
  // const uniquePool = Array.from(new Map(pool.map(b => [b.id, b])).values());
  // const strictlySorted = uniquePool.sort((a, b) => {
  //   const dateA = new Date(a.publishedDate || '1900-01-01');
  //   const dateB = new Date(b.publishedDate || '1900-01-01');
  //   return dateB - dateA;
  // });
  //
  // let results = strictlySorted.filter(book => {
  //   const pDate = new Date(book.publishedDate);
  //   return !isNaN(pDate.getTime()) && pDate >= threeMonthsAgo;
  // });
  //
  // if (results.length < 5) {
  //   const oneYearAgo = new Date();
  //   oneYearAgo.setFullYear(now.getFullYear() - 1);
  //   results = strictlySorted.filter(book => {
  //     const pDate = new Date(book.publishedDate);
  //     return !isNaN(pDate.getTime()) && pDate >= oneYearAgo;
  //   });
  // }
  //
  // if (results.length < 5) {
  //   results = strictlySorted.slice(0, 15);
  // }
  //
  // return rankBooks(results, 'popularity', uniquePool.length).slice(0, 15);
  return [];
}

/**
 * Get featured/trending books for the homepage.
 * DB-only mode: Returns trending books from the database.
 */
async function getFeaturedBooks() {
  const { 
    getPersistedFeaturedSections, 
    isDatabaseAvailable, 
    searchTrendingBooks 
  } = require('./database');

  // 1. Try to get persisted sections from Database
  if (isDatabaseAvailable()) {
    const persisted = await getPersistedFeaturedSections();
    if (persisted && persisted.length > 0) {
      const order = [
        'Trending Now', 
        'Just Announced', 
        'Self Improvement', 
        'Science Fiction', 
        'Mystery & Thriller', 
        'Historical Fiction', 
        'Fantasy Epics'
      ];

      return persisted.sort((a, b) => {
        const indexA = order.indexOf(a.title);
        const indexB = order.indexOf(b.title);
        return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
      });
    }

    // 2. No persisted data — build sections from DB trending data only
    console.log('No persistent featured data found. Building from database...');
    const trendingBooks = await searchTrendingBooks(15);
    if (trendingBooks.length > 0) {
      return [{ title: 'Trending Now', books: trendingBooks }];
    }
  }

  // 3. No data at all — return empty
  console.log('No featured data available (DB-only mode, no Google API).');
  return [];
}

/**
 * Refresh featured sections. 
 * DB-only mode: Just refreshes trending from click data.
 */
async function refreshFeaturedSectionsBackground() {
  const { saveFeaturedSection, isDatabaseAvailable, searchTrendingBooks } = require('./database');
  
  const results = [];

  if (isDatabaseAvailable()) {
    // Trending Now — from user clicks in our DB
    const trendingBooks = await searchTrendingBooks(15);
    if (trendingBooks.length > 0) {
      const bookIds = trendingBooks.map(b => b.id);
      await saveFeaturedSection('Trending Now', bookIds);
      results.push({ title: 'Trending Now', books: trendingBooks });
    }

    // [DISABLED] All other sections relied on Google Books API
    // To re-enable, uncomment the Google API calls and the category loop below:
    //
    // const categories = [
    //   { name: 'Just Announced', query: 'subject:fantasy', orderBy: 'newest' },
    //   { name: 'Self Improvement', query: 'subject:"Self-Help"' },
    //   { name: 'Science Fiction', query: 'subject:"Science Fiction"' },
    //   { name: 'Mystery & Thriller', query: 'subject:"Thriller"' },
    //   { name: 'Historical Fiction', query: 'subject:"Historical Fiction"' },
    //   { name: 'Fantasy Epics', query: 'subject:"Fantasy"' },
    // ];
    //
    // for (const cat of categories) {
    //   let books = [];
    //   if (cat.name === 'Just Announced') {
    //     books = await AnnouncedBooks();
    //   } else {
    //     const pool = await searchGoogleBooks(cat.query, 15, cat.orderBy || 'relevance');
    //     books = rankBooks(pool, 'hybrid', 15);
    //   }
    //   if (books.length > 0) {
    //     try {
    //       const toStore = books.filter(b => b.description);
    //       const texts = toStore.map(b => `${b.title} by ${b.author}. ${b.description}`);
    //       const embeddings = await generateBatchEmbeddings(texts);
    //       const storeItems = toStore.map((book, i) => ({
    //         book, embedding: embeddings[i]
    //       })).filter(item => item.embedding);
    //       const storedIds = await storeBooksBatch(storeItems);
    //       if (storedIds.length > 0) {
    //         await saveFeaturedSection(cat.name, storedIds);
    //       }
    //     } catch (err) {
    //       console.error(`Failed to persist section ${cat.name}:`, err.message);
    //     }
    //     results.push({ title: cat.name, books });
    //   }
    //   await new Promise(r => setTimeout(r, 500));
    // }
  }

  console.log(`Scheduler: Background refresh complete. ${results.length} sections updated.`);
  return results;
}

/**
 * Advanced paginated search via Google Books API.
 * [DISABLED] Google API calls are commented out — returns empty array.
 */
async function searchGoogleBooksPaginated(query, totalResults = 50, orderBy = 'relevance') {
  // try {
  //   const numRequests = Math.ceil(totalResults / 40) + 1;
  //   let startIndex = 0;
  //   const allItems = [];
  //   for (let i = 0; i < numRequests; i++) {
  //     try {
  //       const res = await axios.get(GOOGLE_BOOKS_API, {
  //         params: {
  //           q: query, maxResults: 40, startIndex: startIndex,
  //           printType: 'books', langRestrict: 'en', orderBy: orderBy,
  //           key: process.env.GOOGLE_BOOKS_API_KEY,
  //         },
  //       });
  //       if (res.data && res.data.items) allItems.push(...res.data.items);
  //     } catch (err) {
  //       console.error('Paginated fetch error:', err.message);
  //     }
  //     startIndex += 40;
  //     await new Promise(resolve => setTimeout(resolve, 200));
  //   }
  //   if (allItems.length === 0) return [];
  //   // ... dedup, normalize, filter, rank ...
  // } catch (error) {
  //   console.error('Google Books Paginated error:', error.message);
  //   return [];
  // }
  return [];
}

module.exports = { searchGoogleBooks, getGoogleBookById, getFeaturedBooks, searchGoogleBooksPaginated, refreshFeaturedSectionsBackground, AnnouncedBooks, rankBooks };
