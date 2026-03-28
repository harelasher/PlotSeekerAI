import { renderBookCard, renderBookCardSkeleton } from './BookCard.js';

/**
 * BookGrid component — renders book sections with horizontal scrolling rows.
 */
export function renderBookSections(sections, onBookClick, onSeeAllClick) {
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

    sectionEl.querySelector('.section-see-all').addEventListener('click', () => {
      if (onSeeAllClick) onSeeAllClick(section.title);
    });

    const row = document.createElement('div');
    row.className = 'book-row';
    row.style.cursor = 'grab';

    for (const book of section.books) {
      row.appendChild(renderBookCard(book, onBookClick));
    }

    // --- Desktop Drag-to-Scroll Logic ---
    let isDown = false;
    let isDragging = false;
    let startX;
    let scrollLeft;
    let velocity = 0;
    let momentumID;

    row.addEventListener('mousedown', (e) => {
      isDown = true;
      isDragging = false;
      cancelAnimationFrame(momentumID);
      row.style.cursor = 'grabbing';
      startX = e.pageX - row.offsetLeft;
      scrollLeft = row.scrollLeft;
      velocity = 0;
    });

    row.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - row.offsetLeft;

      if (Math.abs(x - startX) > 5) {
        isDragging = true;
      }

      const walk = (x - startX) * 1;
      const prevScrollLeft = row.scrollLeft;
      row.scrollLeft = scrollLeft - walk;

      // Use weighted velocity to smooth out mouse polling jitters and get a better flick speed
      const instantVelocity = row.scrollLeft - prevScrollLeft;
      velocity = (velocity * 0.2) + (instantVelocity * 0.8);
    });

    const stopDrag = () => {
      if (!isDown) return;
      isDown = false;
      row.style.cursor = 'grab';

      const applyMomentum = () => {
        row.scrollLeft += velocity;
        velocity *= 0.95; // Low friction for very long, fluid sliding
        if (Math.abs(velocity) > 0.1) {
          momentumID = requestAnimationFrame(applyMomentum);
        } else {
          velocity = 0;
        }
      };
      momentumID = requestAnimationFrame(applyMomentum);
    };

    // Intercept clicks when the user was just dragging
    row.addEventListener('click', (e) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    row.addEventListener('mouseleave', stopDrag);
    row.addEventListener('mouseup', stopDrag);

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
