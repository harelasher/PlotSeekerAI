import './style.css';
import { renderHeader } from './components/Header.js';
import { renderSearchBar, setSearchLoading, clearSearchInput } from './components/SearchBar.js';
import { renderBookSections, renderBookSectionsSkeleton } from './components/BookGrid.js';
import { renderResultCard } from './components/BookCard.js';
import { renderBookDetail } from './components/BookDetail.js';
import { searchBooks, getFeaturedBooks } from './api.js';

/* ==========================================================
   PlotSeekerAI — Main App
   ========================================================== */

// --- App State ---
const state = {
  view: 'home',           // 'home' | 'search' | 'detail'
  featuredSections: [],
  searchResults: [],
  searchQuery: '',
  currentBook: null,
  dislikedIds: new Set(),
  isLoading: false,
};

const app = document.getElementById('app');

// --- Initialization ---
async function init() {
  // Render static elements
  app.appendChild(renderHeader(navigateHome));
  
  const mainContent = document.createElement('main');
  mainContent.className = 'main-content';
  mainContent.id = 'main-content';
  app.appendChild(mainContent);

  app.appendChild(renderSearchBar(handleSearch));

  // Load featured books
  await loadFeaturedBooks();
}

// --- Navigation ---
function navigateHome() {
  state.view = 'home';
  state.searchResults = [];
  state.searchQuery = '';
  state.currentBook = null;
  clearSearchInput();
  render();
}

function navigateToDetail(book) {
  state.view = 'detail';
  state.currentBook = book;
  render();
}

// --- Search Handler ---
async function handleSearch(query) {
  state.view = 'search';
  state.searchQuery = query;
  state.isLoading = true;
  render();

  try {
    setSearchLoading(true);
    const dislikedArray = Array.from(state.dislikedIds);
    const data = await searchBooks(query, dislikedArray);
    state.searchResults = data.books || [];
  } catch (error) {
    console.error('Search error:', error);
    state.searchResults = [];
  } finally {
    state.isLoading = false;
    setSearchLoading(false);
    render();
  }
}

// --- Featured Books ---
async function loadFeaturedBooks() {
  state.isLoading = true;
  render();

  try {
    const data = await getFeaturedBooks();
    state.featuredSections = data.sections || [];
  } catch (error) {
    console.error('Failed to load featured books:', error);
    state.featuredSections = [];
  } finally {
    state.isLoading = false;
    render();
  }
}

// --- Dislike Handler ---
function handleDislike(book) {
  if (state.dislikedIds.has(String(book.id))) {
    state.dislikedIds.delete(String(book.id));
  } else {
    state.dislikedIds.add(String(book.id));
    // Animate card removal
    const card = document.querySelector(`[data-book-id="${book.id}"]`);
    if (card) {
      card.style.transition = 'all 0.4s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      setTimeout(() => {
        state.searchResults = state.searchResults.filter(b => String(b.id) !== String(book.id));
        render();
      }, 400);
    }
  }
}

// --- Render ---
function render() {
  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = '';

  switch (state.view) {
    case 'home':
      renderHomePage(main);
      break;
    case 'search':
      renderSearchPage(main);
      break;
    case 'detail':
      renderDetailPage(main);
      break;
  }
}

function renderHomePage(main) {
  // Hero
  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.innerHTML = `
    <h1 class="hero-title">Books, <span class="hero-title-accent">Powered by AI.</span></h1>
    <p class="hero-subtitle">Describe any book idea and discover your next favorite read instantly.</p>
  `;
  main.appendChild(hero);

  // Book sections
  if (state.isLoading) {
    main.appendChild(renderBookSectionsSkeleton(3));
  } else if (state.featuredSections.length > 0) {
    main.appendChild(renderBookSections(state.featuredSections, navigateToDetail));
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">📚</div>
      <p class="empty-state-text">Type something in the search bar to discover books!</p>
    `;
    main.appendChild(empty);
  }
}

function renderSearchPage(main) {
  const section = document.createElement('div');
  section.className = 'search-results';

  // Header
  const header = document.createElement('div');
  header.className = 'search-results-header';
  header.innerHTML = `
    <h2 class="search-results-title">Results for "${state.searchQuery}"</h2>
    <button class="search-results-clear" id="clear-results">← Back to Home</button>
  `;
  section.appendChild(header);

  header.querySelector('#clear-results').addEventListener('click', navigateHome);

  if (state.isLoading) {
    const loader = document.createElement('div');
    loader.className = 'loading-container';
    loader.innerHTML = `
      <div class="loading-spinner"></div>
      <p class="loading-text">Searching with AI...</p>
    `;
    section.appendChild(loader);
  } else if (state.searchResults.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'search-results-grid';

    for (const book of state.searchResults) {
      grid.appendChild(renderResultCard(book, {
        onLike: () => {},
        onDislike: handleDislike,
        onClick: navigateToDetail,
      }));
    }

    section.appendChild(grid);
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">🔍</div>
      <p class="empty-state-text">No books found. Try a different search!</p>
    `;
    section.appendChild(empty);
  }

  main.appendChild(section);
}

async function renderDetailPage(main) {
  if (!state.currentBook) return;

  const detail = await renderBookDetail(state.currentBook, () => {
    // Go back to previous view
    if (state.searchResults.length > 0) {
      state.view = 'search';
    } else {
      state.view = 'home';
    }
    state.currentBook = null;
    render();
  });

  main.appendChild(detail);
}

// --- Start ---
init();
