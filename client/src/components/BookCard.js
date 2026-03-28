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

  card.addEventListener('click', () => {
    if (onClick) onClick(book);
  });

  return card;
}

/**
 * Render a result card for search results (cover + title + summary + why match + actions).
 */
export function renderResultCard(book, { onLike, onDislike, onClick }) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.setAttribute('data-book-id', book.id);
  card.innerHTML = `
    <div class="result-card-cover">
      <img src="${book.coverImage || ''}" alt="${book.title}" loading="lazy"
        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22150%22%3E%3Crect fill=%22%231a2332%22 width=%22100%22 height=%22150%22/%3E%3Ctext fill=%22%236e7681%22 font-family=%22sans-serif%22 font-size=%2212%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Cover%3C/text%3E%3C/svg%3E'" />
    </div>
    <div class="result-card-body">
      <div class="result-card-title">${book.title}</div>
      <div class="result-card-author">by ${book.author || 'Unknown'}</div>
      <div class="result-card-summary">${book.summary || ''}</div>
      ${book.whyMatch ? `<div class="result-card-match">${book.whyMatch}</div>` : ''}
      <div class="result-card-actions">
        <button class="btn-thumb btn-like" title="Like this recommendation" data-action="like">👍</button>
        <button class="btn-thumb btn-dislike" title="Not interested" data-action="dislike">👎</button>
      </div>
    </div>
  `;

  // Click on card body (not buttons) navigates to detail
  card.addEventListener('click', (e) => {
    if (e.target.closest('.btn-thumb')) return;
    if (onClick) onClick(book);
  });

  const likeBtn = card.querySelector('.btn-like');
  const dislikeBtn = card.querySelector('.btn-dislike');

  likeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    likeBtn.classList.toggle('active-like');
    dislikeBtn.classList.remove('active-dislike');
    if (onLike) onLike(book);
  });

  dislikeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dislikeBtn.classList.toggle('active-dislike');
    likeBtn.classList.remove('active-like');
    if (onDislike) onDislike(book);
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
