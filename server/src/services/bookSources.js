const axios = require('axios');

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Search Google Books API and normalize results.
 */
async function searchGoogleBooks(query, maxResults = 12) {
  try {
    const response = await axios.get(GOOGLE_BOOKS_API, {
      params: {
        q: query,
        maxResults,
        printType: 'books',
        langRestrict: 'en',
        orderBy: 'relevance',
      },
    });

    if (!response.data.items) return [];

    return response.data.items.map((item) => {
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
        averageRating: info.averageRating || null,
      };
    }).filter(book => book.coverImage); // Only return books with cover images
  } catch (error) {
    console.error('Google Books API error:', error.message);
    return [];
  }
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
      averageRating: info.averageRating || null,
      publisher: info.publisher || null,
    };
  } catch (error) {
    console.error('Google Books get by ID error:', error.message);
    return null;
  }
}

/**
 * Get featured/trending books for the homepage.
 */
async function getFeaturedBooks() {
  const categories = [
    { name: 'Trending Now', query: 'subject:fiction&orderBy=newest' },
    { name: 'New Releases', query: 'subject:fiction+2024' },
    { name: 'Science Fiction', query: 'subject:science+fiction+bestseller' },
    { name: 'Mystery & Thriller', query: 'subject:thriller+bestseller' },
    { name: 'Self Improvement', query: 'subject:self-help+popular' },
  ];

  const sections = await Promise.all(
    categories.map(async (cat) => {
      const books = await searchGoogleBooks(cat.query, 10);
      return {
        title: cat.name,
        books,
      };
    })
  );

  return sections.filter(s => s.books.length > 0);
}

module.exports = { searchGoogleBooks, getGoogleBookById, getFeaturedBooks };
