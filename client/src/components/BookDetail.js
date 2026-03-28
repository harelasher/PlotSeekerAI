import { getBookDetails } from '../api.js';

/**
 * BookDetail component — full book page with cover, info, and buy button.
 */
export async function renderBookDetail(bookData, onBack) {
  const container = document.createElement('div');
  container.className = 'book-detail';

  // If we only have basic data, try to fetch full details
  let book = bookData;
  if (!book.description || book.description.length < 50) {
    try {
      const result = await getBookDetails(book.id);
      if (result.book) {
        book = { ...book, ...result.book };
      }
    } catch (err) {
      // Use what we have
    }
  }

  const formatPublishedDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (parts.length >= 2) {
      const monthIndex = parseInt(parts[1], 10) - 1;
      return (monthIndex >= 0 && monthIndex < 12) ? `${months[monthIndex]} ${parts[0]}` : parts[0];
    }
    return dateStr; // YYYY or format without dashes
  };

  const metaTags = [];
  if (book.publishedDate) {
    const formattedDate = formatPublishedDate(book.publishedDate);
    if (formattedDate) metaTags.push(formattedDate);
  }
  if (book.pageCount) metaTags.push(`${book.pageCount} pages`);
  if (book.averageRating) {
    const rating = parseFloat(book.averageRating);
    if (!isNaN(rating) && rating > 0) {
      metaTags.push(`⭐ ${rating.toFixed(1)}`);
    }
  }
  if (book.categories?.length) metaTags.push(...book.categories.slice(0, 2));

  container.innerHTML = `
    <button class="book-detail-back" id="detail-back">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5"></path>
        <path d="M12 19l-7-7 7-7"></path>
      </svg>
      Back
    </button>
    <div class="book-detail-content">
      <div class="book-detail-cover">
        <img src="${book.coverImage || ''}" alt="${book.title}"
          onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22280%22 height=%22420%22%3E%3Crect fill=%22%231a2332%22 width=%22280%22 height=%22420%22/%3E%3Ctext fill=%22%236e7681%22 font-family=%22sans-serif%22 font-size=%2216%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Cover%3C/text%3E%3C/svg%3E'" />
      </div>
      <div class="book-detail-info">
        <h1 class="book-detail-title">${book.title}</h1>
        <p class="book-detail-author">by ${book.author || 'Unknown Author'}</p>
        <div class="book-detail-meta">
          ${metaTags.map(tag => `<span class="book-detail-meta-tag">${tag}</span>`).join('')}
        </div>
        <div class="book-detail-description">${book.description || 'No description available.'}</div>
        <a href="${book.affiliateLink || '#'}" target="_blank" rel="noopener noreferrer" class="book-detail-buy">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          Buy on Amazon
        </a>
      </div>
    </div>
  `;

  container.querySelector('#detail-back').addEventListener('click', () => {
    if (onBack) onBack();
  });

  return container;
}
