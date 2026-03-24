# PlotSeekerAI

**AI-Powered Book Discovery Web App** — A smart book search engine disguised as a ChatGPT-style input.

Type what you want → instantly see books that match the idea.

## Quick Start

### 1. Backend

```bash
cd server
cp .env.example .env
# Edit .env with your OpenAI API key
npm install
npm run dev
```

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Tech Stack

- **Frontend:** Vite + Vanilla JS + CSS
- **Backend:** Express.js
- **AI:** OpenAI (embeddings + GPT-4o-mini)
- **Database:** PostgreSQL + pgvector (optional — falls back to Google Books API)
- **Monetization:** Amazon affiliate links

## Features

- 🎨 Netflix-style dark theme homepage
- 🔍 ChatGPT-style floating search bar
- 🤖 AI-powered semantic book search (RAG)
- 📖 Book detail pages with Amazon affiliate links
- 👎 Dislike to filter out books from results
