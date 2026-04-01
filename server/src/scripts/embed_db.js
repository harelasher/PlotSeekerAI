require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const csv = require('csv-parser');
const { generateBatchEmbeddings } = require('../services/openai');

// Initialize Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const CSV_FILE = path.join(__dirname, '../../books.csv');
const BATCH_SIZE = 50; 
const PAUSE_MS = 500; // Delay to respect OpenAI Rate Limits

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Handle Zenodo dates, including any custom Excel columns you added
 */
function parsePublishDate(dateString, fallbackYear, fallbackMonth) {
  // If you used your custom Year/Month columns, use those!
  if (fallbackYear && fallbackMonth) {
    return `${fallbackYear}-${fallbackMonth.padStart(2, '0')}-01`;
  }
  
  if (!dateString) return '1900-01-01';
  let cleanDate = dateString.split(' ')[0]; 
  const parts = cleanDate.split('/');
  if (parts.length === 3) {
      if (parts[2].length === 4) {
         return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
      }
  }
  return cleanDate;
}

function parseGenres(genresString) {
  if (!genresString || genresString === '[]') return [];
  try {
    const cleaned = genresString.replace(/'/g, '"');
    return JSON.parse(cleaned);
  } catch (e) {
    return genresString.replace(/[\[\]']/g, '').split(',').map(s => s.trim());
  }
}

async function bulkStoreAndEmbed() {
  console.log('--- STARTING PLATFORM SEEDER ---');
  console.log(`Reading directly from: ${CSV_FILE}\n`);

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`[ERROR] file not found!`);
    process.exit(1);
  }

  let booksBuffer = [];
  let totalInjected = 0;
  let uniqueTracker = new Set(); 
  let batchPromises = []; 

  const processBatch = async (batch, batchNumber) => {
    try {
      const textsToEmbed = batch.map(b => 
        `Title: ${b.title}. Author: ${b.author}. Genres: ${b.categories.join(', ')}. Synopsis: ${b.description}`
      );

      console.log(`[Batch ${batchNumber}] Requesting Vectors for ${batch.length} books...`);
      const embeddings = await generateBatchEmbeddings(textsToEmbed);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        for (let i = 0; i < batch.length; i++) {
          const b = batch[i];
          const vector = embeddings[i];
          
          if (!vector) continue; 

          await client.query(
            `INSERT INTO books 
            (title, author, description, cover_image, isbn, published_date, categories, page_count, embedding)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
            ON CONFLICT (title, author) DO NOTHING`,
            [
              b.title, 
              b.author, 
              b.description, 
              b.coverImage, 
              b.isbn, 
              b.publishedDate, 
              b.categories, 
              b.pageCount, 
              JSON.stringify(vector)
            ]
          );
          totalInjected++;
        }
        await client.query('COMMIT');
        console.log(`[Batch ${batchNumber}] SUCCESS! Total injected: ${totalInjected}`);
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error(`[DB ERROR Batch ${batchNumber}]`, dbErr.message);
      } finally {
        client.release();
      }

    } catch (apiErr) {
      console.error(`[OPENAI ERROR Batch ${batchNumber}]`, apiErr.message);
    }
  };

  let batchCount = 0;
  const stream = fs.createReadStream(CSV_FILE).pipe(csv());

  console.log('Cleaning, deduplicating, and injecting in real-time...');

  for await (const row of stream) {
    // 1. Garbage checks
    if (!row.title || !row.description || !row.coverImg || row.description.length < 50) continue; 

    const cleanTitle = row.title.trim();
    const cleanAuthor = row.author ? row.author.split(',')[0].trim() : 'Unknown';

    // 2. Duplicate checks
    const uniqueKey = `${cleanTitle.toLowerCase()}|${cleanAuthor.toLowerCase()}`;
    if (uniqueTracker.has(uniqueKey)) continue; 
    uniqueTracker.add(uniqueKey);

    // 3. ISBN Polish
    let cleanIsbn = (row.isbn || '').replace(/\D/g, ''); 
    if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) cleanIsbn = null;

    // 4. Clean mapping (incorporating your Excel columns!)
    const cleanBook = {
      title: cleanTitle,
      author: cleanAuthor,
      description: row.description.trim(),
      coverImage: row.coverImg.trim(),
      isbn: cleanIsbn,
      publishedDate: parsePublishDate(row.publishDate || row.firstPublishDate, row.YEAR, row.MONTH),
      categories: parseGenres(row.genres),
      pageCount: parseInt(row.pages, 10) || 0
    };

    booksBuffer.push(cleanBook);

    if (booksBuffer.length >= BATCH_SIZE) {
      batchCount++;
      const currentBatch = [...booksBuffer];
      booksBuffer = []; 
      
      if (batchPromises.length >= 1) {
          await batchPromises[0];
          batchPromises.shift();
          await sleep(PAUSE_MS); 
      }

      batchPromises.push(processBatch(currentBatch, batchCount));
    }
  }

  if (booksBuffer.length > 0) {
    batchCount++;
    await processBatch(booksBuffer, batchCount);
  }

  await Promise.all(batchPromises);

  console.log(`\n--- EMBEDDING COMPLETE ---`);
  console.log(`Perfectly Saved ${totalInjected} books!`);
  process.exit(0);
}

bulkStoreAndEmbed();
