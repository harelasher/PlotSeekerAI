# 🗺️ PlotSeekerAI Roadmap

Use this file to track the evolution of PlotSeekerAI. Jot down new ideas, track annoying bugs, and keep a history of what we've accomplished.

---

## 🚀🐛 Feature Ideas & Known Bugs and Fixes

*Current issues needing attention.*

- [ ] **Trending now:** make sure this section works; it's based on popularity and rating_count, doesn't need to be updated every refresh, daily is fine.
- [ ] **Just announced:** those books needs to be published within the maximum of 1 month. also will show first based on populariy. doesn't need to be updated every refresh, daily is fine.
- [ ] **header**:

  1. Categories: when hovering over it and trying to get to a category, the slide down might go away very quickly - can't disappear so the user can click on a suggestedcategory. also, making the design of the suggested categories look like the category. for ex: the trending now category can have fire emojis on the side, and the science fiction's border be the color purple and with alien spaceships.
  2. make the p of logo's website centered
  3. when scrolling down, add a little transition that makes the header thinner. and when scrolling all the way back up make it go larger until reaching the starting size.
- [ ] **Search box**:

1. make the little icon on the left aligned and centered.
2. when typing alot of words the box need to have a transition that expends the box a bit so you can see 3 sentences, just like the chatGPT text box.

* [ ] Google Books API error: Request failed with status code 429
* [ ] when searching in the search box a book, it needs to search first in the database if there is a relevent book so it wont just search in the api over and over. however, if there aren't any results that satisfies the user requests, it should ask for books that are relevent from the user request from the api and save it in the database so there won't be any need to search in the api again.
* [ ] inside the book design: make it look better, make the buy on amazon button work

---

## 🧠 Project Thoughts & Logic

*Architectural notes and brainstorms.*

- **Seeded JIT Strategy**: Our current strategy of seeding top books and harvesting new ones during search is working well. Should we increase the initial seed to 2,000 books?
- **Vector Tuning**: Currently using `vector_cosine_ops`. Should we experiment with Manhattan or Euclidean distance to see if relevance changes?
- **Just Announced Ranking**: The "Popularity" sort in the weekly code is great, but maybe we should prioritize "Release Date" strictly for the first 5 slots?

---

## ✅ Completed Tasks

*A history of what we've built.*

- [X] Initial Hybrid Search (Semantic + Popularity) - **2026-03-24**
- [X] Seeded JIT Architecture implementation - **2026-03-28**
- [X] Date-accurate "Just Announced" Weekly Cache - **2026-03-28**
- [X] User-driven "Trending Now" Click Tracking - **2026-03-28**
- [X] Advanced 800-Book Seed Script - **2026-03-28**
- [X] 1-Decimal Star Rating Formatting - **2026-03-28**
