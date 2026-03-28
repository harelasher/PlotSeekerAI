const API_BASE = '/api';

/**
 * Search books using the RAG pipeline.
 */
export async function searchBooks(query, dislikedIds = []) {
  const response = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dislikedIds }),
  });
  if (!response.ok) throw new Error('Search failed');
  return response.json();
}

/**
 * Get featured book sections for the homepage.
 */
export async function getFeaturedBooks() {
  const response = await fetch(`${API_BASE}/books/featured`);
  if (!response.ok) throw new Error('Failed to load featured books');
  return response.json();
}

/**
 * Get top 50 popular books overall.
 */
export async function getBrowseBooks() {
  const response = await fetch(`${API_BASE}/books/browse`);
  if (!response.ok) throw new Error('Failed to load browse books');
  return response.json();
}

/**
 * Get top 30 popular books by category.
 */
export async function getCategoryBooks(category) {
  const response = await fetch(`${API_BASE}/books/category/${encodeURIComponent(category)}`);
  if (!response.ok) throw new Error('Failed to load category books');
  return response.json();
}

/**
 * Get full book details by ID.
 */
export async function getBookDetails(id) {
  const response = await fetch(`${API_BASE}/books/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Book not found');
  return response.json();
}
/**
 * Record a book click for trending analysis.
 */
export async function trackBookClick(id) {
  try {
    fetch(`${API_BASE}/books/${encodeURIComponent(id)}/click`, { 
      method: 'POST' 
    }).catch(() => {});
  } catch (e) {}
}
