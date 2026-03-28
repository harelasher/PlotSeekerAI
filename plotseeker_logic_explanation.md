# PlotSeekerAI - Project Logic and Architecture Explanation

## 1. Project Overview
**PlotSeekerAI** is a full-stack web application designed as an AI-powered book discovery engine. Users describe a book idea in natural language (like chatting with ChatGPT), and the system retrieves the most relevant books using Retrieval-Augmented Generation (RAG) concepts. It then uses AI to summarize exactly *why* each book matches the user's specific query. The app monetizes the recommendations by generating Amazon affiliate links for the books.

The project is split into two parts:
- **Backend (Server):** Node.js + Express.js. Handles AI processing (OpenAI API), database vector similarity search (PostgreSQL + pgvector), and API fallback (Google Books).
- **Frontend (Client):** Vanilla JavaScript + Vite + CSS. A Single Page Application (SPA) architecture rendering different views organically without a full framework like React.

---

## 2. Main Search Logic (RAG Pipeline)
When a user searches for an idea (e.g., "A thriller set in a space station where someone is an imposter"), the logic executes step-by-step:
1. **Vector Embedding:** The backend asks OpenAI to turn the user's search query into a mathematical vector representation (embedding).
2. **Database Vector Search:** The backend searches a PostgreSQL database (using `pgvector`) for books with a high "cosine similarity" to the user's query vector.
3. **Google Books Fallback:** If the database doesn't have enough matches (or is disconnected), the system searches the Google Books API for the query.
4. **Result Merging & Caching:** The system aggregates results to get 12 unique books. Any new books found from Google Books are converted into vectors and stored in the database for future searches.
5. **AI Reasoning:** The system gives the top 12 books to `gpt-4o-mini` and asks it to generate a personalized 2-sentence summary and a "why this matches your query" explanation.
6. **Affiliate Linking:** Amazon Affiliate links are added to all the books before sending the final results to the user.

---

## 3. Server-Side Files Explained (Backend)

We will go over the logic in the `/server` folder.

### `server/src/index.js`
**Purpose:** The main entry point for the backend server.
**How it works:** 
- Sets up the Express server.
- Configures middleware like `cors` (to allow requests from the frontend) and `express.json` (to parse JSON bodies).
- Mounts the search route under `/api`.
- Exposes a simple `/api/health` endpoint for monitoring.
- Sets up basic error handling and starts listening on a port.

### `server/src/routes/search.js`
**Purpose:** Defines the HTTP API endpoints used by the frontend. Consolidates the RAG logic.
**How it works:**
- **`POST /search`:** The core feature. Implements the 5-step RAG pipeline mentioned above. It accepts `query` and `dislikedIds` from the user, uses the OpenAI, Database, and Google Books services to compile books, filters out disliked books, attaches AI explanations, attaches affiliate links, and responds with the finalized JSON.
- **`GET /books/featured`:** Returns trending/featured books for the homepage categories by querying the Google Books API.
- **`GET /books/:id`:** Fetches rich details for a specific book (checking the DB first, then Google Books).

### `server/src/services/openai.js`
**Purpose:** Connects to the OpenAI API for AI capabilities.
**How it works:**
- **`generateEmbedding(text)`:** Uses the `text-embedding-3-small` model to map a text string into a 1536-dimension array (vector). This is crucial for semantic search.
- **`generateBookExplanations(query, books)`:** Passes the list of found books to `gpt-4o-mini` and instructs it to return JSON containing a customized `summary` and `whyMatch` reasoning string.

### `server/src/services/database.js`
**Purpose:** Connects to the PostgreSQL Database and performs `pgvector` operations.
**How it works:**
- **`initDatabase()`:** Attempts to connect to the database securely. If there's no DB configured, it handles the failure gracefully by allowing the app to run in a "fallback mode".
- **`searchSimilarBooks(embedding, limit)`:** Runs a SQL query calculating the `1 - (embedding <=> $1::vector)` cosine similarity to find books that conceptually match the query embedding.
- **`storeBook(book, embedding)`:** Saves newly discovered books and their vectors to the database so future searches are faster and smarter.

### `server/src/services/bookSources.js`
**Purpose:** Integrates with the Google Books REST API.
**How it works:**
- **`searchGoogleBooks(query, maxResults)`:** Fetches raw books matching a keyword query, then maps their chaotic data structure into a clean, normalized format (title, author, cover, isbn).
- **`getGoogleBookById(volumeId)`:** Grabs full details of a specific book from Google.
- **`getFeaturedBooks()`:** Executes searches on predefined categories ("Trending Now", "Science Fiction") to populate the frontend homepage.

### `server/src/utils/affiliateLink.js`
**Purpose:** Handles monetization.
**How it works:** Generates an Amazon Affiliate URL using the `AMAZON_AFFILIATE_TAG` environment variable. If the book has an ISBN, it directs straight to the product page. Otherwise, it generates an Amazon search link based on the book title.

---

## 4. Client-Side Files Explained (Frontend)

The frontend is built without frameworks like React. Instead, it relies on modern ES modules and DOM manipulation inside the `client` folder.

### `client/src/main.js`
**Purpose:** The central logic controller and orchestrator of the frontend Single Page Application (SPA).
**How it works:**
- Contains a global `state` object holding current view (`home`, `search`, `detail`), search results, loading states, and disliked books.
- **`init()`**: Bootstraps the app by rendering structural non-changing elements (like the Header and floating SearchBar), and fetching Featured Books.
- **`render()`**: Acts as a simplified routing mechanism. It clears the `<main>` element and calls the respective sub-render function (`renderHomePage`, `renderSearchPage`, `renderDetailPage`) depending on `state.view`.
- **`handleSearch(query)`**: Modifies state to "loading", makes the search API call, and triggers a re-render to display the AI results.
- **`handleDislike(book)`**: Updates the local `dislikedIds` set and smoothly animates removing a book from the physical DOM if the user doesn't like it.

### `client/src/api.js`
**Purpose:** Serves as a bridge to contact the backend APIs.
**How it works:** Uses the native browser `fetch` API to make HTTP GET/POST calls to endpoints like `/api/search` and `/api/books/featured`.

### `client/src/components/*.js` (UI Component Logic)
These files act like React components but are implemented via native Vanilla JS DOM creation (`document.createElement()`).

- **`Header.js`:** Returns the top navigation bar DOM element containing the logo and abstract navigation buttons.
- **`SearchBar.js`:** Returns the ChatGPT-style floating search input container at the bottom. It binds keydown (`Enter`) events to fire search requests. It also exports functions to toggle its own loading spinner.
- **`BookGrid.js`:** Responsible for rendering horizontal sliding rows of books used in the "Featured" sections on the homepage.
- **`BookCard.js`:** Contains logic to render individual book cards. It has two modes:
  - `renderBookCard`: Renders simple small cards for the homepage grid.
  - `renderResultCard`: Renders large, detailed cards for search results. Crucially, it attaches the AI generated `summary` and `whyMatch` values and listens for `onLike` and `onDislike` button clicks.
- **`BookDetail.js`:** Renders the isolated full-page view for a single book. If the data is incomplete, it automatically fires off `getBookDetails(id)` to the API to populate the rest. It explicitly renders the `affiliateLink` as the "Buy on Amazon" button.
