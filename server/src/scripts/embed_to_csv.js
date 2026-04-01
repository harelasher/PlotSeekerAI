require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const { generateBatchEmbeddings } = require('../services/openai');

const INPUT_CSV = path.join(__dirname, '../../books.csv');
const OUTPUT_CSV = path.join(__dirname, '../../embeddings.csv');
const BATCH_SIZE = 50; 
const PAUSE_MS = 500; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runResumableEmbedder() {
  console.log('--- STARTING RESUMABLE EMBEDDER ---');
  
  // 1. Load already embedded books so we never double-pay OpenAI
  const existingIsbns = new Set();
  
  if (fs.existsSync(OUTPUT_CSV)) {
    console.log(`Found existing embeddings.csv! Learning which books are already embedded...`);
    await new Promise((resolve) => {
      fs.createReadStream(OUTPUT_CSV)
        .pipe(csv())
        .on('data', (row) => {
          if (row.isbn) existingIsbns.add(row.isbn);
        })
        .on('end', resolve);
    });
    console.log(`Resuming... Skipping the ${existingIsbns.size} books we already completed.`);
  }

  // 2. Set up the append-only CSV Writer
  const csvWriter = createObjectCsvWriter({
    path: OUTPUT_CSV,
    header: [
      { id: 'isbn', title: 'isbn' },
      { id: 'embedding', title: 'embedding' }
    ],
    append: fs.existsSync(OUTPUT_CSV) // Append if it exists, otherwise write headers
  });

  let booksBuffer = [];
  let totalSavedInThisRun = 0;
  let batchPromises = []; 

  const processBatch = async (batch, batchNumber) => {
    try {
      const textsToEmbed = batch.map(b => {
        let parts = [`Title: ${b.title}`];
        if (b.author && b.author !== 'Unknown') parts.push(`Author: ${b.author}`);
        if (b.setting && b.setting !== '[]') parts.push(`Setting: ${b.setting}`);
        if (b.characters && b.characters !== '[]') parts.push(`Characters: ${b.characters}`);
        if (b.genres && b.genres !== '[]') parts.push(`Genres: ${b.genres}`);
        parts.push(`Synopsis: ${b.description}`);
        return parts.join('. ');
      });

      console.log(`[Batch ${batchNumber}] Requesting Vectors for ${batch.length} books...`);
      const embeddings = await generateBatchEmbeddings(textsToEmbed);

      const finalRecords = [];
      for (let i = 0; i < batch.length; i++) {
        const b = batch[i];
        const vector = embeddings[i];
        
        if (!vector) continue; 

        finalRecords.push({
          isbn: b.isbn,
          embedding: JSON.stringify(vector)
        });
      }

      await csvWriter.writeRecords(finalRecords);
      totalSavedInThisRun += finalRecords.length;
      console.log(`[Batch ${batchNumber}] SUCCESS! Total saved this session: ${totalSavedInThisRun}`);

    } catch (apiErr) {
      console.error(`[OPENAI ERROR Batch ${batchNumber}]`, apiErr.message);
    }
  };

  let batchCount = 0;
  let newBooksFound = 0;
  const TEST_LIMIT = 200; // Limits the session to 200 new books 

  const stream = fs.createReadStream(INPUT_CSV).pipe(csv());

  console.log('\nStreaming books.csv and catching up...');

  for await (const row of stream) {
    if (newBooksFound >= TEST_LIMIT) {
      console.log(`\n[TEST MODE] Reached ${TEST_LIMIT} new books. Stopping stream early.`);
      stream.destroy();
      break;
    }

    // Determine the unique ISBNS (STRICTLY REQUIRED!)
    let cleanIsbn = (row.isbn || '').replace(/\D/g, ''); 
    if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
      continue; // Skip the book completely if it does not have a valid ISBN
    }

    // 1. RESUMABLE CHECK: Has this exact ISBN already been embedded?
    if (existingIsbns.has(cleanIsbn)) {
      continue; // Skip it! Do not call OpenAI.
    }

    // 2. GARBAGE CHECK
    if (!row.title || !row.description || row.description.length < 50) {
      continue; 
    }

    const cleanBook = {
      isbn: cleanIsbn,
      title: row.title.trim(),
      author: row.author ? row.author.split(',')[0].trim() : 'Unknown',
      description: row.description.trim(),
      characters: row.characters || '',
      setting: row.setting || '',
      genres: row.genres || ''
    };

    newBooksFound++;
    booksBuffer.push(cleanBook);

    // Once we hit 50 valid new books, call OpenAI
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

  // Final stragglers
  if (booksBuffer.length > 0) {
    batchCount++;
    await processBatch(booksBuffer, batchCount);
  }

  await Promise.all(batchPromises);

  console.log(`\n--- EMBEDDING SESSION COMPLETE ---`);
  console.log(`Successfully generated and safely saved ${totalSavedInThisRun} new vectors to embeddings.csv!`);
  process.exit(0);
}

runResumableEmbedder();
