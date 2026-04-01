require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const INPUT_CSV = path.join(__dirname, '../../books.csv');
const OUTPUT_FILE = path.join(__dirname, '../../missing_isbns.csv');

/**
 * Same ISBN cleaning logic as insert_books.js
 */
function getCleanIsbn(raw) {
  let cleaned = (raw || '').replace(/['"]/g, '').trim();
  if (cleaned.includes('E+') || cleaned.includes('e+')) {
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      return num.toLocaleString('fullwide', { useGrouping: false });
    }
  }
  return cleaned.replace(/\D/g, '');
}

async function findMissingIsbns() {
  console.log('--- SEARCHING FOR ISBNS IN CSV NOT IN DATABASE ---');
  
  const client = await pool.connect();
  const dbIsbns = new Set();

  try {
    console.log('Fetching existing ISBNs from database...');
    const res = await client.query('SELECT isbn FROM books');
    res.rows.forEach(row => dbIsbns.add(row.isbn));
    console.log(`Found ${dbIsbns.size} ISBNs in database.\n`);

    const missingWriter = createObjectCsvWriter({
      path: OUTPUT_FILE,
      header: [
        { id: 'title', title: 'title' },
        { id: 'author', title: 'author' },
        { id: 'raw_isbn', title: 'raw_isbn_in_csv' },
        { id: 'cleaned_isbn', title: 'cleaned_isbn_attempt' },
        { id: 'reason', title: 'skip_reason' }
      ]
    });

    const missingBooks = [];
    let processedCount = 0;
    
    console.log('Scanning books.csv...');
    const stream = fs.createReadStream(INPUT_CSV).pipe(csv());

    for await (const row of stream) {
      processedCount++;
      const raw = (row.isbn || '').trim();
      const clean = getCleanIsbn(raw);
      
      let isMissing = false;
      let reason = '';

      // Check if it's missing from DB
      if (clean.length !== 10 && clean.length !== 13) {
        isMissing = true;
        reason = 'Invalid Length (not 10 or 13 after cleaning)';
      } else if (!dbIsbns.has(clean)) {
        isMissing = true;
        reason = 'Valid length but missing from DB (possible duplicate in CSV or insertion error)';
      }

      if (isMissing) {
        missingBooks.push({
          title: row.title,
          author: row.author,
          raw_isbn: raw,
          cleaned_isbn: clean,
          reason: reason
        });
      }

      if (missingBooks.length >= 1000) {
        await missingWriter.writeRecords(missingBooks.splice(0, 1000));
      }
    }

    if (missingBooks.length > 0) {
      await missingWriter.writeRecords(missingBooks);
    }

    console.log(`\n--- SEARCH COMPLETE ---`);
    console.log(`Processed: ${processedCount} rows`);
    console.log(`Found: ${processedCount - dbIsbns.size} rows not in DB (see missing_isbns.csv)`);
    console.log(`Results saved to: ${OUTPUT_FILE}`);

  } catch (err) {
    console.error('[ERROR]', err.message);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

findMissingIsbns();
