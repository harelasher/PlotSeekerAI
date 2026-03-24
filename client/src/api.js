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
 * Get full book details by ID.
 */
export async function getBookDetails(id) {
  const response = await fetch(`${API_BASE}/books/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Book not found');
  return response.json();
}
