import { getBookDetails } from '../api.js';

/**
 * BookCard component — renders a book in grid mode (homepage) or result mode (search)
 */

/**
 * Render a book card for the homepage grid (cover + title + author).
 */
export function renderBookCard(book, onClick) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.innerHTML = `
    <div class="book-card-cover">
      <img src="${book.coverImage || ''}" alt="${book.title}" loading="lazy" 
        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22230%22%3E%3Crect fill=%22%231a2332%22 width=%22160%22 height=%22230%22/%3E%3Ctext fill=%22%236e7681%22 font-family=%22sans-serif%22 font-size=%2214%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Cover%3C/text%3E%3C/svg%3E'" />
    </div>
    <div class="book-card-info">
      <div class="book-card-title">${book.title}</div>
      <div class="book-card-author">${book.author || ''}</div>
    </div>
  `;

  // Predictive Pre-fetch on Hover
  card.addEventListener('mouseenter', () => {
    getBookDetails(book.id).catch(() => {});
  }, { once: true });

  card.addEventListener('click', () => {
    if (onClick) onClick(book);
  });

  return card;
}

/**
 * Render a result card for search results (cover + title + summary + why match + actions).
 */
export function renderResultCard(book, { onLike, onDislike, onClick, isLegendary, index = 0 }) {
  const card = document.createElement('div');
  card.className = `result-card ${isLegendary ? 'legendary-match' : ''}`;
  card.setAttribute('data-book-id', book.id);
  card.style.setProperty('--index', index);

  // Calculate match levels for the bar (30-50, 51-80, 81-100)
  const sim = book.similarity || 0;
  let matchLabel = 'Matching';
  let levels = 1;

  if (sim >= 0.8) {
    matchLabel = 'Perfect Match';
    levels = 3;
  } else if (sim >= 0.5) {
    matchLabel = 'High Match';
    levels = 2;
  }

  card.innerHTML = `
    <div class="result-card-cover">
      <img src="${book.coverImage || ''}" alt="${book.title}" loading="lazy"
        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22150%22%3E%3Crect fill=%22%231a2332%22 width=%22100%22 height=%22150%22/%3E%3Ctext fill=%22%236e7681%22 font-family=%22sans-serif%22 font-size=%2212%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Cover%3C/text%3E%3C/svg%3E'" />
      ${isLegendary ? '<div class="legendary-badge">Legendary Discovery</div>' : ''}
    </div>
    <div class="result-card-body">
      <div class="match-score-container">
        <div class="match-bar" data-levels="${levels}">
          <div class="match-bar-segment"></div>
          <div class="match-bar-segment"></div>
          <div class="match-bar-segment"></div>
        </div>
        <span class="match-label">${matchLabel}</span>
      </div>
      <div class="result-card-title">${book.title}</div>
      <div class="result-card-author">by ${book.author || 'Unknown'}</div>
      <div class="result-card-summary">${book.summary || ''}</div>
    </div>
  `;

  // Predictive Pre-fetch on Hover
  card.addEventListener('mouseenter', () => {
    getBookDetails(book.id).catch(() => {});
  }, { once: true });

  // Click on card body navigates to detail
  card.addEventListener('click', () => {
    if (onClick) onClick(book);
  });

  return card;
}

/**
 * Render skeleton loading cards for the homepage grid.
 */
export function renderBookCardSkeleton() {
  const card = document.createElement('div');
  card.className = 'book-card book-card-skeleton';
  card.innerHTML = `
    <div class="skeleton skeleton-cover"></div>
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-author"></div>
  `;
  return card;
}

