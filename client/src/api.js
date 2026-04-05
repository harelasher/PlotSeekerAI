const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000/api' 
  : '/api'; // Assumes monolith or proxy in prod
const detailsCache = new Map(); // Simple idempotency cache for book details

/**
 * Search books using the hybrid RAG pipeline.
 * Returns instantly (~1-2s) without AI explanations.
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
 * Called AFTER books are shown — fetches AI "why this matches" text.
 * Non-blocking: call this after rendering results and update the UI when it resolves.
 */
export async function explainSearch(query, books) {
  try {
    const response = await fetch(`${API_BASE}/search/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, books }),
    });
    if (!response.ok) return { explanations: [] };
    return response.json();
  } catch {
    return { explanations: [] };
  }
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
export async function getBrowseBooks(offset = 0) {
  const response = await fetch(`${API_BASE}/books/browse?offset=${offset}`);
  if (!response.ok) throw new Error('Failed to load browse books');
  return response.json();
}

/**
 * Get top 30 popular books by category.
 */
export async function getCategoryBooks(category, offset = 0) {
  const response = await fetch(`${API_BASE}/books/category/${encodeURIComponent(category)}?offset=${offset}`);
  if (!response.ok) throw new Error('Failed to load category books');
  return response.json();
}

/**
 * Get full book details by ID.
 * Returns a promise (cached if already started).
 */
export function getBookDetails(id) {
  const strId = String(id);
  if (detailsCache.has(strId)) {
    return detailsCache.get(strId);
  }

  const promise = fetch(`${API_BASE}/books/${encodeURIComponent(strId)}`)
    .then(res => {
      if (!res.ok) throw new Error('Book not found');
      return res.json();
    })
    .catch(err => {
      detailsCache.delete(strId); // Don't cache failures permanently
      throw err;
    });

  detailsCache.set(strId, promise);
  return promise;
}

/**
 * Record a book click for trending analysis.
 */
export async function trackBookClick(id) {
  try {
    fetch(`${API_BASE}/books/${encodeURIComponent(id)}/click`, {
      method: 'POST'
    }).catch(() => { });
  } catch (e) { }
}
