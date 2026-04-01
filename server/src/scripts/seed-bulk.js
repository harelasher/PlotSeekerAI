const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

const INPUT_CSV = path.join(__dirname, '../../books.csv');
const OUTPUT_CSV = path.join(__dirname, '../../books_cleaned.csv');

/**
 * Clean up messy Zenodo dates
 */
function parsePublishDate(dateString) {
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

/**
 * Clean up Zenodo genre arrays
 */
function parseGenres(genresString) {
  if (!genresString || genresString === '[]') return '';
  try {
    const cleaned = genresString.replace(/'/g, '"');
    return JSON.parse(cleaned).join(', ');
  } catch (e) {
    return genresString.replace(/[\[\]']/g, '').trim();
  }
}

async function cleanCsvFile() {
  console.log('--- STARTING CSV CLEANER AND POLISHER ---');
  console.log(`Reading from: ${INPUT_CSV}`);
  
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`[ERROR] file not found at ${INPUT_CSV}`);
    return;
  }

  // Set up the CSV writer for the polished file
  const csvWriter = createObjectCsvWriter({
    path: OUTPUT_CSV,
    header: [
      { id: 'title', title: 'Title' },
      { id: 'author', title: 'Author' },
      { id: 'description', title: 'Description' },
      { id: 'coverImage', title: 'Cover_Image' },
      { id: 'isbn', title: 'ISBN' },
      { id: 'publishedDate', title: 'Published_Date' },
      { id: 'categories', title: 'Categories' },
      { id: 'pageCount', title: 'Page_Count' }
    ]
  });

  let validBooks = [];
  let totalRows = 0;
  let uniqueTracker = new Set(); // To prevent duplicate books
  let duplicatesFound = 0;

  console.log('Cleaning data... (This might take a moment)');

  fs.createReadStream(INPUT_CSV)
    .pipe(csv())
    .on('data', (row) => {
      totalRows++;

      // 1. Garbage Filter: Skip books with missing critical data
      if (!row.title || !row.description || !row.coverImg || row.description.length < 50) {
        return; 
      }

      const cleanTitle = row.title.trim();
      const cleanAuthor = row.author ? row.author.split(',')[0].trim() : 'Unknown';

      // 2. Duplicate Filter: Check if we already have this exact book
      const uniqueKey = `${cleanTitle.toLowerCase()} | ${cleanAuthor.toLowerCase()}`;
      if (uniqueTracker.has(uniqueKey)) {
        duplicatesFound++;
        return; 
      }
      uniqueTracker.add(uniqueKey);

      // 3. ISBN Validator: Must be exactly 10 or 13 digits to be a real ISBN
      let cleanIsbn = row.isbn || '';
      cleanIsbn = cleanIsbn.replace(/\D/g, ''); // Remove all non-numbers
      if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
        cleanIsbn = ''; // Wipe it if it's garbage fake data
      }

      // 4. Polish the remaining books
      const cleanBook = {
        title: cleanTitle,
        author: cleanAuthor,
        description: row.description.trim(),
        coverImage: row.coverImg.trim(),
        isbn: cleanIsbn,
        publishedDate: parsePublishDate(row.publishDate || row.firstPublishDate),
        categories: parseGenres(row.genres),
        pageCount: parseInt(row.pages, 10) || 0
      };

      validBooks.push(cleanBook);
    })
    .on('end', async () => {
      console.log(`\n--- CLEANING COMPLETE ---`);
      console.log(`Original Dataset Size: ${totalRows} rows`);
      console.log(`High-Quality Books Kept: ${validBooks.length} rows`);
      console.log(`Duplicates Removed: ${duplicatesFound} rows`);
      console.log(`Garbage/Empty Books Removed: ${totalRows - validBooks.length - duplicatesFound} rows`);
      
      console.log(`\nWriting clean dataset to ${OUTPUT_CSV}...`);
      
      // Save the polished file
      await csvWriter.writeRecords(validBooks);
      console.log(`[SUCCESS] The polished file is ready! You can now open 'books_cleaned.csv' to review it.`);
      console.log(`It has all the useless columns removed and all the dates fixed.`);
    });
}

cleanCsvFile();
