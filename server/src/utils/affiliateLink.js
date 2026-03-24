/**
 * Generate an Amazon affiliate link from a book's ISBN or title.
 */
function generateAffiliateLink(book) {
  const tag = process.env.AMAZON_AFFILIATE_TAG || 'YOUR_AFFILIATE_TAG';
  
  if (book.isbn) {
    return `https://www.amazon.com/dp/${book.isbn}?tag=${tag}`;
  }
  
  // Fallback: search by title + author
  const searchQuery = encodeURIComponent(`${book.title} ${book.author || ''}`);
  return `https://www.amazon.com/s?k=${searchQuery}&tag=${tag}`;
}

module.exports = { generateAffiliateLink };
