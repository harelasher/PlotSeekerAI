# 🚀 PlotSeekerAI: The Roadmap to 100K Books

This document tracks the evolution of the **PlotSeekerAI** discovery engine. It focuses on the transition from a "Search Tool" to a **"Premium Book Discovery Platform."**




connection errors!!!!!!

---

## ✅ Phase 1: High-Performance Search Architecture

*Goal: Ensure the AI can find anything instantly without crashing the database.*

- [X] **Hybrid Vector Search**: Combined PGVector (Semantic) with pg_trgm (Fuzzy) and FTS (Keyword) for 3-layered accuracy.
- [X] **JIT (Just-In-Time) Expansion**: Implemented "Background enrichment" to save books from Google Books API to our private DB on-the-fly.
- [X] **Semantic Hot-Reload (Cache)**: Queries are cached with 100% of their result IDs to skip expensive vector math for repeat visits.
- [X] **Concurrency & Safety**: All DB operations routed through the `database.js` service layer (fixed the `pool is not defined` errors).
- [ ] **Vector Scaling (HNSW)**: Implement HNSW indexing for the `embeddings` column to maintain speed as the library hits 100,000+ books.

---

## ✅ Phase 2: The Pro UI & Mobile Experience

*Goal: Make the site feel like a premium, native mobile app ($30/mo vibe).*

- [X] **Floating Branding**: Replaced placeholder text with the actual `logo.png` and updated the browser favicon.
- [X] **Centered Mobile "Hero"**: Refactored the Book Detail page to center the Title, Author, Stars, and Cover on phones (resolved the "left-aligned" gap).
- [X] **Search Box Overhaul**: Upgraded the standard input to a **Smart Textarea** (Grows as you type) with a centered layout and a Filter toggle.
- [X] **Glow & Animation Polish**: Fixed the "Gold Glow" clipping on cards and boosted the infinite scroll entrance speed (Batch-aware animations).
- [X] **Symmetric Grid Clamping**: Strict line-clamping on titles (2 lines) and summaries (3 lines) for a perfectly aligned category grid.
- [X] **State Persistence (Scroll Snap)**: Implemented History Snapshots. When you click **Back** from a book, the app instantly restores your entire scrolled list and scroll position.

---

## 🛠️ Phase 3: Expansion & Discovery Features

*Goal: Advanced features to keep users exploring.*

- [ ] **Filter Logic**: Connect the "Filter" button in the search bar to actual backend queries (e.g., Year, Genre Lock, Min-Rating).
- [ ] **OpenLibrary Metadata Fallback**: Automatically fetch missing `page_count` or `publisher` data from OpenLibrary if Google Books is incomplete.
- [ ] **Search Auto-Complete**: Implement a prefix-based title and author suggest API for the search box.
- [ ] **Image Proxy Resilience**: Build a service to handle broken external image links and serve consistent "Cover Missing" assets.
- [ ] **Like/Dislike Personalization**: Implement a feedback system to refine semantic search results based on user preferences.

---

## 💡 Reminders & Future Strategy

*Critical notes for upcoming logic implementations.*

- [ ] **The "Filter Logic" PUSH**: The UI button exists, but we need to connect it to the Backend. The goal is to allow "Hard Filtering" (e.g., Year > 2000, Rating > 4.0) and "Mood Filtering" (e.g., Scarier, Faster Paced) by using our vector neighborhood math.
- [ ] **"Just Announced" Freshness**: We need to refine the `getFeaturedBooks` logic to strictly filter by `publishedDate` (within the last 6 months) to ensure this section lives up to its name as the library scales.

---

> [!NOTE]
> **Next Recommended Task**:
> Now that the UI is polished and scroll-restoration is working, we should implement the **Search Auto-Complete** to help users discover titles even faster as they type.
