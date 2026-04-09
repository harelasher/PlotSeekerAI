import { getBookDetails } from '../api.js';

export function renderBookDetail(bookData, onBack, { isFromSearch = false } = {}) {
  const container = document.createElement('div');
  container.className = 'book-detail';
  let book = { ...bookData };

  const formatPublishedDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (parts.length >= 2) {
      const monthIndex = parseInt(parts[1], 10) - 1;
      return (monthIndex >= 0 && monthIndex < 12) ? `${months[monthIndex]} ${parts[0]}` : parts[0];
    }
    return parts[0];
  };

  const formattedDate = formatPublishedDate(book.publishedDate);
  const rating = parseFloat(book.averageRating) || 0;
  const needsMore = !book.description || book.description.length < 50;

  // Render Skeleton UI instantly
  container.innerHTML = `
    <div class="book-detail-backdrop" style="background-image: url('${book.coverImage || ''}')"></div>

    <div class="book-detail-content">
      <div class="book-detail-left">
        <div class="book-detail-cover">
          <img src="${book.coverImage || ''}" alt="${book.title}"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22280%22 height=%22420%22%3E%3Crect fill=%22%231a2332%22 width=%22280%22 height=%22420%22/%3E%3Ctext fill=%22%236e7681%22 font-family=%22sans-serif%22 font-size=%2216%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Cover%3C/text%3E%3C/svg%3E'" />
        </div>
        <a href="${book.affiliateLink || '#'}" target="_blank" rel="noopener noreferrer" class="book-detail-buy">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          Get this Book
        </a>
      </div>

      <div class="book-detail-info">
        <div class="book-detail-header-group">
          <h1 class="book-detail-title">${book.title}</h1>
          <p class="book-detail-author">by <span>${book.author || 'Unknown Author'}</span></p>
        </div>

        ${rating > 0 ? `
          <div class="book-detail-rating">
            <div class="rating-stars">${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}</div>
            <span class="rating-score">${rating.toFixed(1)}</span>
          </div>
        ` : ''}

        ${book.whyMatch || isFromSearch ? `
          <div class="book-detail-ai-vibe ${!book.whyMatch ? 'loading' : ''}">
            <h3>✨ Why it matches your search</h3>
            <p>${book.whyMatch || 'Discovering why this is the perfect read for you...'}</p>
          </div>
        ` : ''}

        <div class="book-detail-stats" id="detail-stats">
          <div class="stat-item">
            <span class="stat-label">Published</span>
            <span class="stat-value">${formattedDate || '...'}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Pages</span>
            <span class="stat-value">${book.pageCount || '...'}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Reference</span>
            <span class="stat-value">${book.id}</span>
          </div>
        </div>

        <div class="book-detail-section">
          <h3>Description</h3>
          <div class="book-detail-description" id="detail-desc">
            ${book.description ? book.description.replace(/\n/g, '<br>') : `
              <div class="skeleton skeleton-text"></div>
              <div class="skeleton skeleton-text medium"></div>
              <div class="skeleton skeleton-text"></div>
              <div class="skeleton skeleton-text short"></div>
            `}
          </div>
        </div>

        <div class="book-detail-section" id="detail-categories">
          ${book.categories?.length ? `
            <h3>Categories</h3>
            <div class="book-detail-genres">
              ${book.categories.map(cat => `<span class="genre-tag">${cat}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;


  // 2. Background enrichment
  if (needsMore) {
    getBookDetails(book.id).then(result => {
      if (!result.book) return;
      const b = result.book;

      // Patch Description
      const descEl = container.querySelector('#detail-desc');
      if (descEl && b.description) {
        descEl.style.opacity = '0';
        setTimeout(() => {
          descEl.innerHTML = b.description.replace(/\n/g, '<br>');
          descEl.style.transition = 'opacity 0.4s ease';
          descEl.style.opacity = '1';
        }, 100);
      }

      // Patch Links (if updated)
      const buyBtn = container.querySelector('.book-detail-buy');
      if (buyBtn && b.affiliateLink && b.affiliateLink !== '#') {
        buyBtn.href = b.affiliateLink;
      }

      // Patch Stats
      const statsEl = container.querySelector('#detail-stats');
      if (statsEl) {
        const date = formatPublishedDate(b.publishedDate);
        statsEl.innerHTML = `
          <div class="stat-item"><span class="stat-label">Published</span><span class="stat-value">${date || 'N/A'}</span></div>
          <div class="stat-item"><span class="stat-label">Pages</span><span class="stat-value">${b.pageCount || 'N/A'}</span></div>
          <div class="stat-item"><span class="stat-label">Reference</span><span class="stat-value">${b.id}</span></div>
        `;
      }

      // Patch Categories
      const catEl = container.querySelector('#detail-categories');
      if (catEl && b.categories?.length) {
        catEl.innerHTML = `
          <h3>Categories</h3>
          <div class="book-detail-genres">
            ${b.categories.map(cat => `<span class="genre-tag">${cat}</span>`).join('')}
          </div>
        `;
      }
    }).catch(err => console.error("Enrichment failed:", err));
  }

  return container;
}

