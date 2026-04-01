require('dotenv').config();
const { AnnouncedBooks } = require('../services/bookSources');

/**
 * Updated Test Script
 * Uses the improved AnnouncedBooks function which handles manual sorting and sliding windows.
 */
async function testAnnounced() {
  console.log('--- TESTING UPDATED ANNOUNCED BOOKS LOGIC ---');
  console.log('Fetching latest books with manual date sorting...');

  try {
    const books = await AnnouncedBooks();

    if (!books || books.length === 0) {
      console.warn('\n[!] No books found even with fallback. Check API key/Network.');
      return;
    }

    console.log(`\nFinal Selection (Found ${books.length}):`);
    console.table(books.map(b => ({
      Title: b.title.length > 35 ? b.title.substring(0, 32) + '...' : b.title,
      Author: b.author,
      Released: b.publishedDate,
      Pages: b.pageCount,
      Stars: b.averageRating || 'N/A'
    })));

  } catch (err) {
    console.error('\n[X] Test failed:', err.message);
  }
}

testAnnounced();
