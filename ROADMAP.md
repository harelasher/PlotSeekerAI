# PlotSeekerAI Project Roadmap 🚀

This roadmap outlines the remaining technical requirements, feature requests, and known bugs for the PlotSeekerAI discovery platform.

## 🏁 Phase 1: Data Mastery (Current Focus)
- [ ] **Full Vectorization (44,000 Books)**  
  - [ ] Run `embed_to_csv.js` to completion (current script is resumable).
  - [ ] Develop `sync_embeddings.js` to perform a high-speed Batch UPDATE on the PostgreSQL `embedding` column from the CSV file.
- [ ] **Metadata Enrichment**  
  - [ ] Implement a fallback to fetch missing "page_count" or "publisher" data from the OpenLibrary API if Google Books fails.
- [ ] **Fix 503 API Errors**  
  - [ ] Implement Exponential Backoff (retries) in `bookSources.js` to handle Google Books API service-unavailable responses.

## 🧠 Phase 2: AI & Search Optimization
- [ ] **Hybrid Search Refinement**  
  - [ ] Implement query expansion: If a user types "Sad books", automatically expand the vector search to also look for "Melancholy", "Emotional", and "Tragic".
- [ ] **Advanced Semantic Caching**  
  - [ ] Update `search_cache` to store not just the embedding, but also the "Top 5 Result IDs" to bypass the vector search entirely for 100% exact query matches.
- [ ] **Prompt Engineering**  
  - [ ] Fine-tune the "Why it matches" GPT-4 prompts to be more concise and "vibe-oriented".

## 🎨 Phase 3: Frontend & User Experience
- [ ] **Infinite Scroll**  
  - [ ] Implement an IntersectionObserver in the React frontend to load more results seamlessly as the user scrolls.
- [ ] **Vibe Tags/Filters**  
  - [ ] Add UI chips for popular semantic filters (e.g., "Dark Academia", "Cozy Mystery", "Hard Sci-Fi") that trigger pre-calculated vector searches.
- [ ] **Book Detail Modal**  
  - [ ] create a high-performance modal page that shows the full description, series information, and awards without a full page reload.

## 🐛 Known Bugs & Challenges
- **[BUG] Search Cache Mismatch**: Some old cache entries might still have the `isbn` format. Need to add a migration script to clear `search_cache` table one last time.
- **[CHALLENGE] Empty Descriptions**: Books missing descriptions in the CSV cannot be embedded. They currently appear in "Type-to-search" but not "Vibe search". 
- **[BUG] ID Format Edge-cases**: Some "ASINs" in the CSV might be 11 characters instead of 10. Need to verify regex in `insert_books.js` for 100% accuracy.
- **[PERFORMANCE] Parallel OpenAI Calls**: Need to ensure `generateBatchEmbeddings` doesn't hit OpenAI's rate limit for 50,000 books during the initial run.

---
*Last Updated: 2026-04-01*
