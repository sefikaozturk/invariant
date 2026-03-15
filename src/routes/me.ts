import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, listings } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const me = new Hono();

me.get('/', requireAuth, async (c) => {
  const user = c.get('user')!;

  const [dbUser] = await db.select({
    id: users.id, username: users.username, avatarUrl: users.avatarUrl,
    stripeOnboarded: users.stripeOnboarded, verificationLevel: users.verificationLevel,
    balanceCents: users.balanceCents, createdAt: users.createdAt,
  }).from(users).where(eq(users.id, user.sub)).limit(1);

  if (!dbUser) return c.json({ error: 'User not found' }, 404);

  const myListings = await db.select().from(listings).where(eq(listings.userId, user.sub));

  return c.json({ user: dbUser, listings: myListings });
});

export default me;
