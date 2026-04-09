
const { Pool } = require('pg');
const path = require('path');

// Load environment variables from the server folder's .env
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function shrink() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not found. Run this from the server/src/scripts folder.');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('--- DB SHRINK PROCESS STARTED ---');

    console.log('1. Dropping obsolete metadata columns...');
    await pool.query(`
      ALTER TABLE books 
        DROP COLUMN IF EXISTS info_link,
        DROP COLUMN IF EXISTS ratings_count,
        DROP COLUMN IF EXISTS embedding,   -- Potential singular/plural typo column
        DROP COLUMN IF EXISTS characters,
        DROP COLUMN IF EXISTS awards,
        DROP COLUMN IF EXISTS setting,
        DROP COLUMN IF EXISTS series,
        DROP COLUMN IF EXISTS language,
        DROP COLUMN IF EXISTS publisher,
        DROP COLUMN IF EXISTS book_format;
    `);

    console.log('2. Pruning search cache (stale entries > 30 days)...');
    const cacheRes = await pool.query(`
      DELETE FROM search_cache WHERE last_used_at < NOW() - INTERVAL '30 days'
    `);
    console.log(`✅ Removed ${cacheRes.rowCount} cached items.`);

    console.log('3. Reclaiming disk space (VACUUM FULL)...');
    await pool.query('VACUUM FULL books');

    console.log('\n--- SUCCESS: Database is now optimized ---');
  } catch (err) {
    console.error('❌ Operation Failed:', err.message);
  } finally {
    await pool.end();
  }
}

shrink();
