/**
 * Generate a direct Amazon link from a book's ISBN or title.
 */
function generateAffiliateLink(book) {
  // Use ISBN or ASIN if available
  const isbnOrAsin = book.id || book.isbn;

  if (isbnOrAsin && /^[a-zA-Z0-9]+$/.test(isbnOrAsin)) {
    // ISBN-10 (standard ASIN) -> Direct Product Link
    if (isbnOrAsin.length === 10) {
      return `https://www.amazon.com/dp/${isbnOrAsin}`;
    }
    // ISBN-13 -> Search Query Link (most reliable for fulfillment)
    if (isbnOrAsin.length === 13) {
      return `https://www.amazon.com/s?k=${isbnOrAsin}`;
    }
  }

  // Fallback: search by title + author if no direct ID is available
  const searchQuery = encodeURIComponent(`${book.title} ${book.author || ''}`);
  return `https://www.amazon.com/s?k=${searchQuery}`;
}

module.exports = { generateAffiliateLink };
