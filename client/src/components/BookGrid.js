import { renderBookCard, renderBookCardSkeleton } from './BookCard.js';

/**
 * BookGrid component — renders book sections with horizontal scrolling rows.
 */
export function renderBookSections(sections, onBookClick) {
  const container = document.createElement('div');
  container.className = 'book-sections';

  for (const section of sections) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'book-section';
    sectionEl.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">${section.title}</h2>
        <span class="section-see-all">See all →</span>
      </div>
    `;

    const row = document.createElement('div');
    row.className = 'book-row';

    for (const book of section.books) {
      row.appendChild(renderBookCard(book, onBookClick));
    }

    sectionEl.appendChild(row);
    container.appendChild(sectionEl);
  }

  return container;
}

/**
 * Render skeleton loading sections.
 */
export function renderBookSectionsSkeleton(count = 3) {
  const container = document.createElement('div');
  container.className = 'book-sections';

  for (let s = 0; s < count; s++) {
    const section = document.createElement('div');
    section.className = 'book-section';
    section.innerHTML = `
      <div class="section-header">
        <div class="skeleton" style="width: 140px; height: 22px;"></div>
      </div>
    `;

    const row = document.createElement('div');
    row.className = 'book-row';

    for (let i = 0; i < 8; i++) {
      row.appendChild(renderBookCardSkeleton());
    }

    section.appendChild(row);
    container.appendChild(section);
  }

  return container;
}
