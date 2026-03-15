import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { listings, users } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const listingsRouter = new Hono();

listingsRouter.get('/', async (c) => {
  const typeFilter = c.req.query('type');

  const results = await db.select({
    id: listings.id, type: listings.type, provider: listings.provider,
    title: listings.title, description: listings.description,
    faceValue: listings.faceValue, askingPrice: listings.askingPrice,
    creditType: listings.creditType, proofLink: listings.proofLink,
    contactInfo: listings.contactInfo, createdAt: listings.createdAt,
    userId: listings.userId, status: listings.status,
    autoMatch: listings.autoMatch,
    username: users.username, avatarUrl: users.avatarUrl,
    sellerEscrow: users.stripeOnboarded,
    verificationLevel: users.verificationLevel,
  })
    .from(listings)
    .leftJoin(users, eq(listings.userId, users.id))
    .where(
      typeFilter === 'selling' || typeFilter === 'buying'
        ? eq(listings.type, typeFilter)
        : undefined
    )
    .orderBy(desc(listings.createdAt));

  return c.json(results);
});

listingsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select({
    id: listings.id, type: listings.type, provider: listings.provider,
    title: listings.title, description: listings.description,
    faceValue: listings.faceValue, askingPrice: listings.askingPrice,
    creditType: listings.creditType, proofLink: listings.proofLink,
    contactInfo: listings.contactInfo, createdAt: listings.createdAt,
    userId: listings.userId, status: listings.status,
    autoMatch: listings.autoMatch,
    username: users.username, avatarUrl: users.avatarUrl,
  })
    .from(listings)
    .leftJoin(users, eq(listings.userId, users.id))
    .where(eq(listings.id, id))
    .limit(1);

  if (result.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json(result[0]);
});

listingsRouter.post('/', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json();
  const { type, provider, title, description, faceValue, askingPrice, creditType, proofLink, contactInfo, autoMatch } = body;

  if (!type || !provider || !title || !askingPrice || !creditType || !contactInfo) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  if (type !== 'selling' && type !== 'buying') {
    return c.json({ error: 'Type must be selling or buying' }, 400);
  }

  const duplicates = await db.select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.userId, user.sub), eq(listings.provider, provider), eq(listings.status, 'active')))
    .limit(1);

  if (duplicates.length > 0) {
    return c.json({ error: 'You already have an active listing for this provider.' }, 409);
  }

  const [inserted] = await db.insert(listings).values({
    userId: user.sub,
    type, provider, title,
    description: description || null,
    faceValue: faceValue ? Number(faceValue) : null,
    askingPrice: Number(askingPrice),
    creditType,
    proofLink: proofLink || null,
    contactInfo,
    autoMatch: autoMatch || false,
  }).returning();

  return c.json(inserted, 201);
});

listingsRouter.patch('/:id/traded', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const [existing] = await db.select({ id: listings.id, userId: listings.userId })
    .from(listings).where(eq(listings.id, id)).limit(1);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.userId !== user.sub) return c.json({ error: 'Forbidden' }, 403);

  const [updated] = await db.update(listings)
    .set({ status: 'traded', updatedAt: new Date() })
    .where(eq(listings.id, id))
    .returning({ id: listings.id, status: listings.status });

  return c.json(updated);
});

listingsRouter.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const [existing] = await db.select({ id: listings.id, userId: listings.userId })
    .from(listings).where(eq(listings.id, id)).limit(1);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.userId !== user.sub) return c.json({ error: 'Forbidden' }, 403);

  await db.delete(listings).where(eq(listings.id, id));
  return c.json({ ok: true });
});

export default listingsRouter;
