import { db, client } from './db/index.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('Running migrations...');
  // drizzle-kit push handles schema sync
  // this file is for manual migrations if needed
  console.log('Use `npm run db:push` to sync schema.');
  await client.end();
}

migrate().catch(console.error);
