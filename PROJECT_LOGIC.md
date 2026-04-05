# PlotSeekerAI - Technical Architecture & Data Flow

This document provides a deep-dive into how PlotSeekerAI works, from the moment a user lands on the homepage to the complex "vibe-based" search engine logic.

---

## 1. Project Overview
PlotSeekerAI shifted from being a Google Books API wrapper to a **high-performance local search engine**. 
*   **The Goal**: Instant, AI-powered book discovery without depending on slow external APIs.
*   **The Engine**: A "hybrid" RAG (Retrieval-Augmented Generation) pipeline using PostgreSQL + `pgvector`.

---

## 2. Infrastructure Stack

### **Database (The Library)**
*   **PostgreSQL with pgvector**: Stores 50,000+ books with their titles, authors, descriptions, and—most importantly—vector embeddings (1536-dimensional math representations of the book's "vibe").
*   **Schema**:
    *   `books`: The core table with metadata, `featured_count` (for rotation), and `embedding` (for search).
    *   `featured_sections`: A snapshot table that holds the current lists for the homepage.
    *   `search_cache`: Stores previously calculated AI embeddings to save cost and time.

### **Server (The Brain)**
*   **Node.js / Express**: Handles API requests asynchronously.
*   **OpenAI SDK**: Used to convert user search phrases into vectors (text-embedding-3-small).

### **Client (The Face)**
*   **React + Vite**: A modern frontend that communicates with the server via a clean API layer (`src/api.js`).

---

## 3. The Lifecycle: User Journey

### Phase A: Joining the Website (Homepage)
When you first enter the site, the client calls `GET /api/books/featured`.
1.  **Request**: "What's on the homepage right now?"
2.  **Server**: Fetches the latest lists from the `featured_sections` table.
3.  **Database Rotation**: Behind the scenes, a **Scheduler** runs every 6 hours.
    *   It checks for books in specific genres (e.g., "Science Fiction").
    *   It picks books that have the **Lowest `featured_count`**.
    *   It clears the old list and saves the new one.
    *   *Result*: The homepage stays fresh every day without manual updates.

### Phase B: Search (The Hybrid RAG Pipeline)
When you search for something like *"cozy mystery with a cup of tea"*:
1.  **Vectorization**: The server checks if this exact phrase has been searched before (`search_cache`). If not, it asks OpenAI to convert the phrase into a 1536-dimensional vector.
2.  **Hybrid Search (3-Layer Logic)**:
    *   **Layer 1 (Semantic)**: Uses `pgvector` to find books with similar "vibes" based on description.
    *   **Layer 2 (Text Match)**: Uses `pg_trgm` to find exact title/author name matches (to catch typos).
    *   **Layer 3 (Full-Text Search)**: Uses standard PostgreSQL FTS to find specific keywords.
3.  **Merging**: The server combines these scores using a weighted algorithm and returns the top 12 matches.

### Phase C: Interaction (Tracking & AI)
1.  **Click Tracking**: When you click a book, the client calls `POST /api/books/:id/click`. The DB increments the `clicks` counter, which automatically pushes that book higher in the **"Trending Now"** section for other users.
2.  **AI Explanations**: After the books load, a separate non-blocking call is made to OpenAI to generate a "Why this matches your search" summary for each result.

---

## 4. Where do the books come from?
The books in your database were originally imported from **Open Library's** massive dataset. 
*   **Media Enrichment**: We ran specialized scripts (`src/scripts/update_covers_google.js`) to find high-quality cover images from Google Books and Amazon based on ISBNs.
*   **Local Permanence**: Every book is now locally stored. If Google Books or Open Library goes down tomorrow, PlotSeekerAI keeps running perfectly.

---

## 5. Security & Performance
*   **Environment Variables**: All API keys and DB credentials stay hidden in the `.env` file.
*   **Connection Pooling**: The `pg` Pool ensures that even if 100 users join at once, the database handles the traffic efficiently.
*   **Watch Mode**: The server uses `node --watch`, allowing it to survive crashes and update instantly when code changes.

---

> [!NOTE]
> This architecture is designed for **Scalability**. Adding a new genre section to the homepage is as simple as adding one line to the `rotationPlan` in `bookSources.js`.

> [!TIP]
> To see this logic in action, look at the **Browser Console** (`F12`). I have added logs that tell you exactly when data is coming from your Local Database!
