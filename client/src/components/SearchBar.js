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
      <input type="text" id="search-input" placeholder="Search books..." autocomplete="off" />
      <button class="search-bar-submit" id="search-submit" title="Search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5l0 14"></path>
          <path d="M18 11l-6-6-6 6"></path>
        </svg>
      </button>
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

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
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
