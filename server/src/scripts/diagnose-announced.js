require('dotenv').config();
const axios = require('axios');

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

async function diagnoseAnnounced() {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const formatDate = (d) => d.toISOString().split('T')[0];
  const afterDate = formatDate(threeMonthsAgo);

  const query = `subject:fiction`;
  console.log(`Diagnosing with query: ${query}`);
  console.log(`Searching for books after: ${afterDate}`);
  console.log(`Using API Key: ${process.env.GOOGLE_BOOKS_API_KEY ? 'FOUND' : 'MISSING'}`);

  try {
    const response = await axios.get(GOOGLE_BOOKS_API, {
      params: {
        q: query,
        maxResults: 10,
        printType: 'books',
        langRestrict: 'en',
        orderBy: 'newest',
        key: process.env.GOOGLE_BOOKS_API_KEY,
      },
    });

    if (!response.data.items) {
      console.log('No raw items found at all.');
      return;
    }

    console.log(`Found ${response.data.items.length} raw items.`);
    
    response.data.items.forEach((item, i) => {
      const info = item.volumeInfo;
      console.log(`\n--- Book ${i+1} ---`);
      console.log(`Title: ${info.title}`);
      console.log(`Cover: ${!!info.imageLinks?.thumbnail}`);
      console.log(`PubDate: ${info.publishedDate}`);
      console.log(`Categories: ${info.categories?.length || 0}`);
      console.log(`PageCount: ${info.pageCount}`);
      
      const pass = (
        info.imageLinks?.thumbnail &&
        info.title &&
        info.description &&
        info.publishedDate &&
        info.categories?.length > 0 &&
        info.pageCount
      );
      console.log(`Quality Pass: ${!!pass}`);
    });

  } catch (err) {
    console.error('Diagnosis failed:', err.message);
  }
}

diagnoseAnnounced();
