const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:admin@localhost:5433/plotseeker' });
async function check() {
  await client.connect();
  const res = await client.query('SELECT id, title, author, LEFT(description, 50) as summary, published_date FROM books_imported WHERE description IS NOT NULL LIMIT 5');
  console.log('--- DATA SAMPLE ---');
  console.table(r => r.rows); // console.table doesn't work with a callback this way, use simple log
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
check().catch(console.error);
