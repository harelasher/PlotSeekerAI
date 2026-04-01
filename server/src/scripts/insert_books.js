require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const csv = require('csv-parser');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const CSV_FILE = path.join(__dirname, '../../books.csv');
const BATCH_SIZE = 500; // Fast batching

/**
 * Handle messy Excel arrays like "['Fantasy', 'Fiction']"
 */
function parseArrayString(arrStr) {
  if (!arrStr || arrStr === '[]' || arrStr === '0') return [];
  try {
    return JSON.parse(arrStr.replace(/'/g, '"'));
  } catch (e) {
    return arrStr.replace(/[\[\]']/g, '').split(',').map(s => s.trim()).filter(Boolean);
  }
}

/**
 * Convert separate YEAR and MONTH columns to a standard SQL Date string
 */
function buildDate(year, month) {
  if (year && month) return `${year}-${String(month).padStart(2, '0')}-01`;
  if (year) return `${year}-01-01`;
  return null;
}

async function insertAllBooks() {
  console.log('--- STARTING DATABASE RESET & INSERTION ---');
  console.log(`Reading from: ${CSV_FILE}\n`);

  if (!fs.existsSync(CSV_FILE)) {
    console.error('[ERROR] books.csv not found!');
    process.exit(1);
  }

  // Run schema first
  const schemaSQL = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8');
  const client = await pool.connect();
  
  await client.query('DROP TABLE IF EXISTS books CASCADE;');
  await client.query(schemaSQL);
  console.log('[OK] Schema applied and Old books table deleted successfully.\n');

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalDuplicates = 0;

  try {
    // 1. CLEARING NOT NEEDED (Table dropped and fully recreated)
    console.log('Starting fresh insertion...\n');

    let booksBuffer = [];

    const insertBatch = async (batch) => {
      await client.query('BEGIN');
      try {
        let batchInsertedCount = 0;
        for (const b of batch) {
          const res = await client.query(
            `INSERT INTO books 
              (id, title, series, author, description, cover_image, language, genres, characters, book_format, page_count, publisher, awards, setting, published_date, average_rating, info_link, ratings_count)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             ON CONFLICT (id) DO NOTHING
             RETURNING id`,
            [
              b.id, b.title, b.series, b.author, b.description, b.coverImage, b.language, 
              b.genres, b.characters, b.bookFormat, b.pageCount, b.publisher, b.awards, b.setting, 
              b.publishedDate, b.rating, null, 0
            ]
          );
          if (res.rowCount > 0) batchInsertedCount++;
          else totalDuplicates++;
        }
        await client.query('COMMIT');
        totalInserted += batchInsertedCount;
        if (totalInserted % 5000 === 0 && totalInserted > 0) {
          console.log(`[PROGRESS] Inserted ${totalInserted} books...`);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[BATCH ERROR] Skipping batch. Error:`, err.message);
      }
    };

    const stream = fs.createReadStream(CSV_FILE).pipe(csv());

    for await (const row of stream) {
      // 1. THE PERFECT ID FIX: Strip raw quotes
      let rawId = (row.isbn || '').replace(/['"]/g, '').trim();
      let cleanId = '';

      // Rescue Excel scientific notation (e.g. 9.78E+12)
      if (rawId.includes('E+') || rawId.includes('e+')) {
        const parsedNum = parseFloat(rawId);
        if (!isNaN(parsedNum)) {
          cleanId = parsedNum.toLocaleString('fullwide', { useGrouping: false });
        }
      } else {
        // Strip everything except letters and numbers
        let stripped = rawId.replace(/[^a-zA-Z0-9]/g, '');
        
        if (/^\d+$/.test(stripped)) {
          // Pure numbers = ISBN! Must be exactly 10 or 13 digits.
          if (stripped.length === 10 || stripped.length === 13) {
            cleanId = stripped;
          }
        } else if (/^[a-zA-Z0-9]+$/.test(stripped)) {
          // Letters + Numbers = ASIN! Must be exactly 10 characters length.
          if (stripped.length === 10) {
            cleanId = stripped;
          }
        }
      }

      if (!cleanId) {
        totalSkipped++;
        continue; 
      }

      const cleanBook = {
        id: cleanId,
        title: (row.title || '').trim(),
        series: (row.series || '').trim() || null,
        author: row.author ? row.author.split(',')[0].trim() : null,
        description: (row.description || '').trim() || null,
        coverImage: (row.coverImg || '').trim() || null,
        language: (row.language || '').trim() || null,
        genres: parseArrayString(row.genres),
        characters: parseArrayString(row.characters),
        bookFormat: (row.bookFormat || '').trim() || null,
        pageCount: parseInt(row.pages, 10) || 0,
        publisher: (row.publisher || '').trim() || null,
        awards: parseArrayString(row.awards),
        setting: parseArrayString(row.setting),
        publishedDate: buildDate(row.YEAR, row.MONTH),
        rating: parseFloat(row.rating) || 0
      };

      booksBuffer.push(cleanBook);

      if (booksBuffer.length >= BATCH_SIZE) {
        await insertBatch([...booksBuffer]);
        booksBuffer = [];
      }
    }

    // Flush remaining
    if (booksBuffer.length > 0) {
      await insertBatch(booksBuffer);
    }

    // Print summary
    const countResult = await client.query('SELECT COUNT(*) FROM books');
    console.log(`\n--- INSERTION COMPLETE ---`);
    console.log(`Books inserted successfully: ${totalInserted}`);
    console.log(`Books skipped (no ISBN found): ${totalSkipped}`);
    console.log(`Books blocked by Postgres (Duplicate / Corrupted ISBN): ${totalDuplicates}`);
    console.log(`Total rows in Postgres database: ${countResult.rows[0].count}`);

  } catch (err) {
    console.error('[FATAL ERROR]', err.message);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

insertAllBooks();
