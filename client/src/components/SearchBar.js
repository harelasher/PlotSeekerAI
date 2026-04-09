/**
 * SearchBar component — floating ChatGPT-style input at bottom center
 */
export function renderSearchBar(onSearch) {
  const container = document.createElement('div');
  container.className = 'search-bar-container';
  container.innerHTML = `
    <div class="search-bar">
      <span class="search-bar-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </span>
      <textarea id="search-input" placeholder="Describe a plot, a vibe, or a feeling..." rows="1" autocomplete="off" spellcheck="false"></textarea>
      
      <div class="search-bar-actions">
        <!-- Filter Button hidden for now (Reminder in ROADMAP.md)
        <button class="search-bar-filter" id="search-filter" title="Search Filters (Coming Soon)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="21" x2="4" y2="14"></line>
            ...
          </svg>
        </button>
        -->
        <button class="search-bar-submit" id="search-submit" title="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5l0 14"></path>
            <path d="M18 11l-6-6-6 6"></path>
          </svg>
        </button>
      </div>
    </div>
  `;

  const input = container.querySelector('#search-input');
  const submitBtn = container.querySelector('#search-submit');

  function doSearch() {
    const query = input.value.trim();
    if (query && onSearch) {
      onSearch(query);
    }
  }

  // Auto-expanding textarea logic
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    const newHeight = Math.min(input.scrollHeight, 120);
    input.style.height = newHeight + 'px';
  });

  input.addEventListener('keydown', (e) => {
    // Enter to search, Shift+Enter for new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSearch();
    }
  });

  submitBtn.addEventListener('click', doSearch);

  return container;
}

/**
 * Set loading state on the search bar submit button.
 */
export function setSearchLoading(isLoading) {
  const btn = document.querySelector('#search-submit');
  if (btn) {
    btn.classList.toggle('loading', isLoading);
    btn.disabled = isLoading;
  }
}

/** 
 * Clear the search input.
 */
export function clearSearchInput() {
  const input = document.querySelector('#search-input');
  if (input) input.value = '';
}

/**
 * Visual Cooldown indicator for the search button.
 */
export function setSearchCooldown(isCooldown) {
  const btn = document.querySelector('#search-submit');
  if (btn) btn.classList.toggle('on-cooldown', isCooldown);
}
