/**
 * Generate an Amazon affiliate link from a book's ISBN or title.
 */
function generateAffiliateLink(book) {
  const tag = process.env.AMAZON_AFFILIATE_TAG || 'YOUR_AFFILIATE_TAG';
  const isbnOrAsin = book.id || book.isbn;
  
  if (isbnOrAsin && /^[a-zA-Z0-9]+$/.test(isbnOrAsin) && (isbnOrAsin.length === 10 || isbnOrAsin.length === 13)) {
    return `https://www.amazon.com/dp/${isbnOrAsin}?tag=${tag}`;
  }
  
  // Fallback: search by title + author
  const searchQuery = encodeURIComponent(`${book.title} ${book.author || ''}`);
  return `https://www.amazon.com/s?k=${searchQuery}&tag=${tag}`;
}

module.exports = { generateAffiliateLink };
