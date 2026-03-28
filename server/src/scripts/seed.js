require('dotenv').config();
const { searchGoogleBooksPaginated } = require('../services/bookSources');
const { generateBatchEmbeddings } = require('../services/openai');
const { storeBooksBatch, initDatabase, clearBooksTable } = require('../services/database');

/**
 * PlotSeekerAI — Advanced 800-Book Database Seeder
 */

const SEED_GENRES = [
  'Fiction', 'Science Fiction', 'Fantasy', 'Mystery', 'Thriller',
  'Romance', 'Self-Help', 'Psychology', 'History', 'Biography',
  'Science', 'Business', 'Technology', 'Philosophy', 'Travel',
  'Cooking', 'Art', 'Health & Fitness', 'Manga', 'Cybersecurity'
];

const BOOKS_PER_GENRE = 45; // 45 * 20 = 900 potential books total

async function seed() {
  console.log('🚀 Starting Advanced 800-Book Database Seeder...');
  
  const dbReady = await initDatabase();
  if (!dbReady) {
    console.error('❌ Database connection failed.');
    process.exit(1);
  }

  // Rule 1: Clear existing table
  console.log('🚮 Clearing existing books table to ensure a fresh catalog...');
  await clearBooksTable();

  let totalSeeded = 0;
  const currentYear = 2026;

  for (const genre of SEED_GENRES) {
    try {
      console.log(`\n📚 [Seeding Genre: ${genre}]`);
      
      const pool = await searchGoogleBooksPaginated(`subject:"${genre}"`, BOOKS_PER_GENRE, 'relevance');
      
      if (!pool.length) {
        console.warn(`   ⚠️ No books found for genre ${genre}.`);
        continue;
      }

      // Rule 2 & 3: Randomize ratings with Year Bias
      for (const book of pool) {
        let maxRange = 15; // Base for older books
        const yearMatch = String(book.publishedDate || '2000').match(/\d{4}/);
        const year = yearMatch ? parseInt(yearMatch[0], 10) : 2000;
        const diff = Math.abs(currentYear - year);

        if (diff <= 1) maxRange = 50;      // Current/Next Year (Strongest)
        else if (diff <= 3) maxRange = 40;  // Very Recent
        else if (diff <= 5) maxRange = 30;  // Modern
        else if (diff <= 10) maxRange = 25; // Decent
        
        book.ratingsCount = Math.floor(Math.random() * (maxRange + 1));
        // Also randomize a high-performing rating if it's new
        book.averageRating = 3.5 + (Math.random() * 1.5); 
      }

      // Step 2-4: Process in small batches for stability
      const texts = pool.map(b => `${b.title} by ${b.author}. ${b.description}`);
      console.log('   - Processing AI embeddings in 1 batch...');
      const embeddings = await generateBatchEmbeddings(texts);

      const storeItems = pool.map((book, i) => ({
        book,
        embedding: embeddings[i]
      })).filter(item => item.embedding);

      console.log(`   - Storing ${storeItems.length} books with vectors...`);
      const insertedIds = await storeBooksBatch(storeItems);
      
      totalSeeded += insertedIds.length;
      console.log(`   ✅ Genre ${genre} complete (+${insertedIds.length} books).`);
      
      await new Promise(res => setTimeout(res, 2000));
    } catch (error) {
      console.error(`   ❌ Failed to seed genre ${genre}:`, error.message);
    }
    
    if (totalSeeded >= 800) {
      console.log('\n🌟 Reached target of 800+ books. Stopping.');
      break;
    }
  }

  console.log(`\n✨ SEED COMPLETE! Total new books in database: ${totalSeeded}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});
