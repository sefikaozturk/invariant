import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, listings } from '../db/schema.js';
import { signToken } from '../lib/jwt.js';

const demoRouter = new Hono();

demoRouter.use('*', async (c, next) => {
  if (process.env.DEMO_MODE !== 'true') {
    return c.json({ error: 'Demo mode not enabled. Set DEMO_MODE=true in .env' }, 403);
  }
  await next();
});

// POST /api/demo/setup
// Seeds two demo users (seller + buyer), pre-funds buyer, creates listings, returns JWT
demoRouter.post('/setup', async (c) => {
  // Upsert demo seller
  const [seller] = await db
    .insert(users)
    .values({
      githubId: 99999001,
      username: 'demo-seller',
      avatarUrl: null,
      balanceCents: 0,
      verificationLevel: 'github',
    })
    .onConflictDoUpdate({
      target: users.githubId,
      set: { username: 'demo-seller' },
    })
    .returning();

  // Upsert demo buyer with $500 pre-funded balance
  const [buyer] = await db
    .insert(users)
    .values({
      githubId: 99999002,
      username: 'demo-buyer',
      avatarUrl: null,
      balanceCents: 50_000,
      verificationLevel: 'github',
    })
    .onConflictDoUpdate({
      target: users.githubId,
      set: { balanceCents: 50_000 },
    })
    .returning();

  // Only seed listings if seller has none active (idempotent)
  const existing = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.userId, seller.id), eq(listings.status, 'active')))
    .limit(1);

  let listingsSeeded = 0;
  if (existing.length === 0) {
    const seedListings = [
      {
        userId: seller.id,
        type: 'selling' as const,
        provider: 'OpenAI',
        title: '$50 OpenAI API Credits',
        description: '$50 in OpenAI API credits. Transferred via organization invite.',
        faceValue: 5000,
        askingPrice: 3800,
        creditType: 'api',
        contactInfo: 'agent-managed',
        autoMatch: true,
      },
      {
        userId: seller.id,
        type: 'selling' as const,
        provider: 'Anthropic',
        title: '$100 Anthropic Claude API Credits',
        description: '$100 in Anthropic API credits for Claude models.',
        faceValue: 10_000,
        askingPrice: 7500,
        creditType: 'api',
        contactInfo: 'agent-managed',
        autoMatch: true,
      },
      {
        userId: seller.id,
        type: 'selling' as const,
        provider: 'Google Cloud',
        title: '$200 Google Cloud Credits',
        description: '$200 in Google Cloud compute credits, expires 2025-12-31.',
        faceValue: 20_000,
        askingPrice: 14_000,
        creditType: 'compute',
        contactInfo: 'agent-managed',
        autoMatch: true,
      },
      {
        userId: seller.id,
        type: 'selling' as const,
        provider: 'AWS',
        title: '$500 AWS Activate Credits',
        description: '$500 in AWS credits from the Activate program.',
        faceValue: 50_000,
        askingPrice: 32_000,
        creditType: 'compute',
        contactInfo: 'agent-managed',
        autoMatch: false, // requires manual handoff — not eligible for instant buy
      },
    ];

    const created = await db.insert(listings).values(seedListings).returning();
    listingsSeeded = created.length;
  }

  const token = await signToken({ sub: buyer.id, username: buyer.username });

  return c.json({
    message: 'Demo environment ready',
    buyer: {
      id: buyer.id,
      username: buyer.username,
      balanceCents: buyer.balanceCents,
    },
    seller: {
      id: seller.id,
      username: seller.username,
    },
    listingsSeeded,
    token,
  });
});

export default demoRouter;
