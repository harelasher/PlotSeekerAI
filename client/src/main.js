import './style.css';
import { renderHeader } from './components/Header.js';
import { renderSearchBar, setSearchLoading, clearSearchInput } from './components/SearchBar.js';
import { renderBookSections, renderBookSectionsSkeleton } from './components/BookGrid.js';
import { renderResultCard } from './components/BookCard.js';
import { renderBookDetail } from './components/BookDetail.js';
import { searchBooks, getFeaturedBooks, getBookDetails, getBrowseBooks, getCategoryBooks, trackBookClick } from './api.js';

/* ==========================================================
   PlotSeekerAI — Main App
   ========================================================== */

// --- App State ---
const state = {
  view: 'home',           // 'home' | 'search' | 'detail' | 'browse' | 'category'
  featuredSections: [],
  searchResults: [],
  browseResults: [],
  searchQuery: '',
  currentCategory: '',
  currentBook: null,
  dislikedIds: new Set(),
  isLoading: false,
  listScrollPos: 0,
};

const app = document.getElementById('app');

// Override browser's native habit of remembering scroll positions strictly on fresh reloads
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// --- Initialization ---
async function init() {
  window.scrollTo(0, 0); // Force to very top of page on boot
  // Render static elements
  app.appendChild(renderHeader(navigateHome, navigateBrowse, navigateCategory));
  
  const mainContent = document.createElement('main');
  mainContent.className = 'main-content';
  mainContent.id = 'main-content';
  app.appendChild(mainContent);

  app.appendChild(renderSearchBar(handleSearch));

  window.addEventListener('popstate', handleUrlChange);
  
  // Bind Escape key to natively navigate back from detailed view, or explicitly home from category view/search.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.view === 'detail') {
        window.history.back(); // Standard native back routing (alters URL seamlessly)
      } else if (state.view === 'category' || state.view === 'search') {
        navigateHome(); // Explicitly go home from lists
      }
    }
  });

  await handleUrlChange();
}

async function handleUrlChange() {
  const path = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  const returningFromBook = state.view === 'detail';

  if (query) {
    await handleSearch(query, true);
    if (returningFromBook) setTimeout(() => window.scrollTo(0, state.listScrollPos), 10);
    return;
  }

  if (path.startsWith('/books/')) {
    const bookId = path.replace('/books/', '');
    if (bookId) {
      if (!returningFromBook) state.listScrollPos = window.scrollY;
      await loadBookById(bookId);
      return;
    }
  } else if (path.startsWith('/browse')) {
    navigateHome(true, returningFromBook);
    if (returningFromBook) setTimeout(() => window.scrollTo(0, state.listScrollPos), 10);
    return;
  } else if (path.startsWith('/category/')) {
    const cat = decodeURIComponent(path.replace('/category/', ''));
    if (cat) {
      navigateCategory(cat, true, returningFromBook);
      if (returningFromBook) setTimeout(() => window.scrollTo(0, state.listScrollPos), 10);
      return;
    }
  }
  
  // Default to home
  navigateHome(true, returningFromBook);
  if (state.featuredSections.length === 0) {
    await loadFeaturedBooks();
  }
  if (returningFromBook) setTimeout(() => window.scrollTo(0, state.listScrollPos), 10);
}

async function loadBookById(id) {
  state.isLoading = true;
  state.view = 'detail';
  render();

  try {
    const data = await getBookDetails(id);
    if (data.book) {
      state.currentBook = data.book;
    } else {
      navigateHome();
    }
  } catch (error) {
    console.error(error);
    navigateHome();
  } finally {
    state.isLoading = false;
    render();
  }
}

// --- Navigation ---
function navigateHome(skipHistory = false, restoring = false) {
  if (!restoring) window.scrollTo(0, 0);
  state.view = 'home';
  state.searchResults = [];
  state.searchQuery = '';
  state.currentBook = null;
  clearSearchInput();
  if (!skipHistory && (window.location.pathname !== '/' || window.location.search !== '')) {
    window.history.pushState({}, '', '/');
  }
  render();
}

function navigateToDetail(book, skipHistory = false) {
  state.view = 'detail';
  state.currentBook = book;
  state.listScrollPos = window.scrollY;
  window.scrollTo(0, 0);
  if (!skipHistory) {
    window.history.pushState({ bookId: book.id }, '', `/books/${book.id}`);
  }
  render();
  
  // Track this view for trending analysis
  trackBookClick(book.id);
}

function navigateBrowse(skipHistory = false) {
  // Redirect Browse to Home based on user request
  navigateHome(skipHistory);
  if (state.featuredSections.length === 0) {
    loadFeaturedBooks();
  }
}

function navigateCategory(category, skipHistory = false, restoring = false) {
  if (!restoring) window.scrollTo(0, 0);
  state.view = 'category';
  state.currentCategory = category;
  state.searchQuery = '';
  if (!skipHistory) window.history.pushState({}, '', `/category/${encodeURIComponent(category)}`);
  loadCategoryBooks(category);
}

// --- Search Handler ---
async function handleSearch(query, skipHistory = false) {
  window.scrollTo(0, 0);
  state.view = 'search';
  state.searchQuery = query;

  if (!skipHistory) {
    window.history.pushState({ query }, '', `/?q=${encodeURIComponent(query)}`);
  }
  
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

// --- Browse Loaders ---
async function loadBrowseBooks() {
  state.isLoading = true;
  state.browseResults = [];
  render();
  try {
    const data = await getBrowseBooks();
    state.browseResults = data.books || [];
  } catch (error) {
    console.error(error);
  } finally {
    state.isLoading = false;
    render();
  }
}

async function loadCategoryBooks(category) {
  state.isLoading = true;
  state.browseResults = [];
  render();
  try {
    const data = await getCategoryBooks(category);
    state.browseResults = data.books || [];
  } catch (error) {
    console.error(error);
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
    case 'browse':
    case 'category':
      renderBrowsePage(main);
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
    main.appendChild(renderBookSections(state.featuredSections, navigateToDetail, navigateCategory));
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

  header.querySelector('#clear-results').addEventListener('click', () => navigateHome());

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

function renderBrowsePage(main) {
  const section = document.createElement('div');
  section.className = 'search-results';

  const header = document.createElement('div');
  header.className = 'search-results-header';
  const title = state.view === 'browse' ? 'Top 50 Popular Books' : `Top 30 Books in ${state.currentCategory}`;
  header.innerHTML = `
    <h2 class="search-results-title">${title}</h2>
    <button class="search-results-clear" id="browse-home">← Back to Home</button>
  `;
  section.appendChild(header);

  header.querySelector('#browse-home').addEventListener('click', () => navigateHome());

  if (state.isLoading) {
    const loader = document.createElement('div');
    loader.className = 'loading-container';
    loader.innerHTML = `
      <div class="loading-spinner"></div>
      <p class="loading-text">Fetching top books...</p>
    `;
    section.appendChild(loader);
  } else if (state.browseResults.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'search-results-grid';

    for (const book of state.browseResults) {
      grid.appendChild(renderResultCard(book, {
        onLike: () => {},
        onDislike: () => {}, 
        onClick: navigateToDetail,
      }));
    }
    section.appendChild(grid);
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">📚</div>
      <p class="empty-state-text">No books found.</p>
    `;
    section.appendChild(empty);
  }

  main.appendChild(section);
}

async function renderDetailPage(main) {
  if (!state.currentBook) return;

  const detail = await renderBookDetail(state.currentBook, () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateHome();
    }
  });

  main.appendChild(detail);
}

// --- Start ---
init();
