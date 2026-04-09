import './style.css';
import { renderHeader } from './components/Header.js';
import { renderSearchBar, setSearchLoading, clearSearchInput, setSearchCooldown } from './components/SearchBar.js';
import { renderBookSections, renderBookSectionsSkeleton } from './components/BookGrid.js';
import { renderResultCard } from './components/BookCard.js';
import { renderBookDetail } from './components/BookDetail.js';
import { renderFooter } from './components/Footer.js';
import { searchBooks, explainSearch, getFeaturedBooks, getBookDetails, getBrowseBooks, getCategoryBooks, trackBookClick } from './api.js';

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
  isLoading: false,
  isFetchingMore: false,  // true when infinite scrolling
  hasMoreBooks: true,     // true if there's more data to fetch
  browseOffset: 0,        // current pagination offset for browse/category
  listScrollPos: 0,
  isRestoring: false,     // true when navigating back — suppresses animations & AI calls
  lastSearchTime: 0,      // last manual search timestamp for cooldown
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
  app.appendChild(renderFooter());

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

function restoreScroll(pos) {
  // Use double-RAF to ensure layout has painted before scrolling
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, pos);
    });
  });
}

async function handleUrlChange() {
  const path = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  const returningFromBook = state.view === 'detail';

  const historyState = window.history.state;
  if (historyState && historyState.view === 'search' && historyState.query) {
    state.view = 'search';
    state.searchQuery = historyState.query;

    if (historyState.results && historyState.results.length > 0) {
      state.searchResults = historyState.results;
      state.isLoading = false;
      state.isRestoring = true;
      await render();
      state.isRestoring = false;
      if (returningFromBook) restoreScroll(state.listScrollPos);
    } else {
      await handleSearch(historyState.query, true);
      if (returningFromBook) restoreScroll(state.listScrollPos);
    }
    return;
  }

  if (historyState && historyState.view === 'home') {
    state.isRestoring = true;
    await navigateHome(true, returningFromBook);
    state.isRestoring = false;
    if (returningFromBook) restoreScroll(state.listScrollPos);
    return;
  }

  if (query) {
    await handleSearch(query);
    if (returningFromBook) restoreScroll(state.listScrollPos);
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
    state.isRestoring = true;
    await navigateHome(true, returningFromBook);
    state.isRestoring = false;
    if (returningFromBook) restoreScroll(state.listScrollPos);
    return;
  } else if (path.startsWith('/category/')) {
    const cat = decodeURIComponent(path.replace('/category/', ''));
    if (cat) {
      if (historyState && historyState.view === 'category' && historyState.category === cat && historyState.results) {
        state.view = 'category';
        state.currentCategory = cat;
        state.browseResults = historyState.results;
        state.browseOffset = historyState.offset;
        state.isRestoring = true;
        await navigateCategory(cat, true, true);
        state.isRestoring = false;
        if (returningFromBook) restoreScroll(state.listScrollPos);
      } else {
        await navigateCategory(cat, false, false);
      }
      return;
    }
  }

  state.isRestoring = true;
  await navigateHome(true, returningFromBook);
  if (state.featuredSections.length === 0) {
    await loadFeaturedBooks();
  }
  state.isRestoring = false;
  if (returningFromBook) restoreScroll(state.listScrollPos);

  // Clear suppression after restoration is painted — allows infinite scroll animations to work again
  requestAnimationFrame(() => {
    document.querySelectorAll('.no-animation').forEach(el => el.classList.remove('no-animation'));
  });
}

async function loadBookById(id) {
  state.isLoading = true;
  state.view = 'detail';
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
    await render();
  }
}

async function navigateHome(skipHistory = false, restoring = false) {
  // window.scrollTo(0, 0) moved to render() for better synchronization
  state.view = 'home';
  state.searchResults = [];
  state.searchQuery = '';
  state.currentBook = null;
  currentRenderedId = null;
  clearSearchInput();

  if (!skipHistory) {
    window.history.pushState({ view: 'home' }, '', '/');
  }
  await render();
}

async function navigateToDetail(book, skipHistory = false) {
  state.view = 'detail';
  state.currentBook = book;
  state.listScrollPos = window.scrollY;
  // window.scrollTo(0, 0) moved to render() for better synchronization
  if (!skipHistory) {
    window.history.pushState({ view: 'detail', bookId: book.id }, '', `/books/${book.id}`);
  }
  await render();
  trackBookClick(book.id);
}

async function navigateBrowse(skipHistory = false) {
  await navigateHome(skipHistory);
  if (state.featuredSections.length === 0) {
    await loadFeaturedBooks();
  }
}

async function navigateCategory(category, skipHistory = false, restoring = false) {
  state.view = 'category';
  state.currentCategory = category;
  state.searchQuery = '';
  // Don't reset offset if we're restoring from history state
  if (!restoring) {
    state.browseOffset = 0;
    state.browseResults = [];
    state.hasMoreBooks = true;
  }
  currentRenderedId = null;

  if (!skipHistory) {
    window.history.pushState({ 
      view: 'category', 
      category, 
      results: state.browseResults,
      offset: state.browseOffset 
    }, '', `/category/${encodeURIComponent(category)}`);
  }
  
  if (!restoring) {
    await loadCategoryBooks(category);
  } else {
    await render();
  }
}

async function handleSearch(query, skipHistory = false) {
  const now = Date.now();
  if (!skipHistory && (now - state.lastSearchTime < 3000)) {
    // Show a visual alert/notice if we wanted to, but silent ignore/logging is better for UX
    console.log(`Search cooldown active. Wait ${Math.ceil((3000 - (now - state.lastSearchTime)) / 1000)}s.`);
    return;
  }
  if (!skipHistory) {
    state.lastSearchTime = now;
    setSearchCooldown(true);
    setTimeout(() => setSearchCooldown(false), 3000);
  }

  window.scrollTo(0, 0);
  state.view = 'search';
  state.searchQuery = query;
  currentRenderedId = null;

  if (!skipHistory) {
    window.history.pushState({ view: 'search', query, results: [] }, '', '/');
  }

  state.isLoading = true;
  await render();

  try {
    setSearchLoading(true);
    const data = await searchBooks(query, []);
    state.searchResults = data.books || [];

    if (!skipHistory) {
      window.history.replaceState({ view: 'search', query, results: state.searchResults }, '', '/');
    }
  } catch (error) {
    console.error('Search error:', error);
    state.searchResults = [];
  } finally {
    state.isLoading = false;
    setSearchLoading(false);
    await render();
  }
}

async function loadFeaturedBooks() {
  state.isLoading = true;
  await render();
  try {
    const data = await getFeaturedBooks();
    state.featuredSections = data.sections || [];
  } catch (error) {
    console.error('Failed to load featured books:', error);
    state.featuredSections = [];
  } finally {
    state.isLoading = false;
    await render();
  }
}

async function loadBrowseBooks(append = false) {
  if (!append) {
    state.isLoading = true;
    state.browseResults = [];
    state.browseOffset = 0;
    state.hasMoreBooks = true;
    currentRenderedId = null;
    await render();
  } else {
    state.isFetchingMore = true;
    const observer = document.querySelector('.scroll-observer');
    if (observer) observer.innerHTML = '<div class="loading-spinner small"></div>';
  }

  try {
    const data = await getBrowseBooks(state.browseOffset);
    const newBooks = data.books || [];
    if (newBooks.length < 50) state.hasMoreBooks = false;
    state.browseResults = [...state.browseResults, ...newBooks];
    state.browseOffset += newBooks.length;
    if (append) appendBooksToUI(newBooks);
  } catch (error) {
    console.error(error);
  } finally {
    state.isLoading = false;
    state.isFetchingMore = false;
    if (!append) await render();
  }
}

async function loadCategoryBooks(category, append = false) {
  if (!append) {
    state.isLoading = true;
    state.browseResults = [];
    state.browseOffset = 0;
    state.hasMoreBooks = true;
    await render();
  } else {
    state.isFetchingMore = true;
    const observer = document.querySelector('.scroll-observer');
    if (observer) observer.innerHTML = '<div class="loading-spinner small"></div>';
  }

  try {
    const data = await getCategoryBooks(category, state.browseOffset);
    const newBooks = data.books || [];
    if (newBooks.length < 30) state.hasMoreBooks = false;
    state.browseResults = [...state.browseResults, ...newBooks];
    state.browseOffset += newBooks.length;
    
    // Update history state so "Back" restores all currently loaded batches
    if (state.view === 'category' && state.currentCategory) {
      window.history.replaceState({ 
        view: 'category', 
        category: state.currentCategory, 
        results: state.browseResults,
        offset: state.browseOffset 
      }, '', window.location.pathname);
    }
    
    if (append) appendBooksToUI(newBooks);
  } catch (error) {
    console.error(error);
  } finally {
    state.isLoading = false;
    state.isFetchingMore = false;
    if (!append) await render();
  }
}

function appendBooksToUI(newBooks) {
  const grid = document.querySelector('.search-results-grid');
  if (!grid) return;
  newBooks.forEach((book, index) => {
    grid.appendChild(renderResultCard(book, {
      onClick: navigateToDetail,
      index: index // Use batch index, not absolute, for snappy animations
    }));
  });
  const observer = document.querySelector('.scroll-observer');
  if (observer) {
    observer.innerHTML = '';
    if (!state.hasMoreBooks) observer.remove();
  }
}

// --- Render ---
let isRenderLocked = false;
let currentRenderedId = null;

async function render() {
  const main = document.getElementById('main-content');
  if (!main || isRenderLocked) return;

  const targetId = state.view === 'detail' ? String(state.currentBook?.id || '') : null;
  if (targetId && targetId === currentRenderedId) return;

  isRenderLocked = true;
  currentRenderedId = targetId;

  main.setAttribute('data-view', state.view);
  if (state.isRestoring) main.setAttribute('data-restoring', '');
  else main.removeAttribute('data-restoring');

  main.innerHTML = '';

  // Sync scroll reset with the blank state to prevent visible list-jumps
  if (!state.isRestoring) {
    window.scrollTo(0, 0);
  }

  try {
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
        await renderDetailPage(main);
        break;
    }
  } finally {
    isRenderLocked = false;
  }
}

function renderHomePage(main) {
  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.innerHTML = `
    <h1 class="hero-title">Books, <span class="hero-title-accent">Powered by AI.</span></h1>
    <p class="hero-subtitle">Describe any book idea and discover your next favorite read instantly.</p>
  `;
  main.appendChild(hero);

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
    grid.className = state.isRestoring ? 'search-results-grid no-animation' : 'search-results-grid';
    state.searchResults.forEach((book, index) => {
      const isLegendary = index === 0 && book.similarity >= 0.9;
      grid.appendChild(renderResultCard(book, {
        onClick: navigateToDetail,
        isLegendary,
        index
      }));
    });
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
  const title = state.view === 'browse' ? 'Browse Popular Books' : `Top Books in ${state.currentCategory}`;
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
    grid.className = state.isRestoring ? 'search-results-grid no-animation' : 'search-results-grid';
    state.browseResults.forEach((book, index) => {
      grid.appendChild(renderResultCard(book, {
        onClick: navigateToDetail,
        index
      }));
    });
    section.appendChild(grid);

    if (state.hasMoreBooks) {
      const observerTarget = document.createElement('div');
      observerTarget.className = 'scroll-observer';
      observerTarget.style.height = '100px';
      section.appendChild(observerTarget);
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !state.isFetchingMore) {
          if (state.view === 'browse') loadBrowseBooks(true);
          else loadCategoryBooks(state.currentCategory, true);
        }
      }, { threshold: 0.1 });
      observer.observe(observerTarget);
    }
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
  
  const isFromSearch = !!state.searchQuery;
  const detail = renderBookDetail(state.currentBook, () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateHome();
    }
  }, { isFromSearch });

  if (state.isRestoring) {
    detail.classList.add('no-animation');
  }

  main.appendChild(detail);

  // If entering from a search, generate the AI match explanation on-demand
  if (isFromSearch && !state.currentBook.whyMatch) {
    const query = state.searchQuery;
    const book = state.currentBook;
    explainSearch(query, [book]).then(({ explanations }) => {
      // Current book check for edge-case navigation
      if (state.view !== 'detail' || state.currentBook?.id !== book.id) return;
      
      if (explanations && explanations[0]) {
        const { whyMatch, summary } = explanations[0];
        book.whyMatch = whyMatch;
        book.summary = summary; // Optimized atmospheric summary also used here

        // Snappy UI update
        const vibeEl = detail.querySelector('.book-detail-ai-vibe');
        if (vibeEl) {
          const p = vibeEl.querySelector('p');
          if (p) {
            p.style.opacity = '0';
            setTimeout(() => {
              p.textContent = whyMatch;
              p.style.transition = 'opacity 0.4s ease';
              p.style.opacity = '1';
              vibeEl.classList.remove('loading');
            }, 100);
          }
        }
      }
    }).catch(() => {
      const vibeEl = detail.querySelector('.book-detail-ai-vibe');
      if (vibeEl) vibeEl.remove(); // Silently hide if it fails
    });
  }

  if (state.isRestoring) {
    // Instant visibility for history restoration
    detail.setAttribute('data-visible', 'true');
  } else {
    // Normal snappy transition for fresh clicks
    requestAnimationFrame(() => {
      detail.setAttribute('data-visible', 'true');
    });
  }
}

// --- Start ---
init();
