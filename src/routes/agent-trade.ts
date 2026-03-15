import { Hono } from 'hono';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import { users, listings, transactions, balanceLedger, agentProfiles, agentKeys } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT) || 7;
const AUTO_RELEASE_HOURS = Number(process.env.AUTO_RELEASE_HOURS) || 72;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key);
}

const agentTradeRouter = new Hono();

// ── Balance ─────────────────────────────────────────
agentTradeRouter.get('/balance', requireAuth, async (c) => {
  const user = c.get('user')!;
  const [u] = await db.select({ balanceCents: users.balanceCents })
    .from(users).where(eq(users.id, user.sub)).limit(1);
  if (!u) return c.json({ error: 'User not found' }, 404);
  return c.json({ balanceCents: u.balanceCents });
});

// ── Deposit (creates Stripe Checkout → webhook credits balance) ──
agentTradeRouter.post('/deposit', requireAuth, async (c) => {
  const user = c.get('user')!;
  const { amountCents } = await c.req.json();

  if (!amountCents || amountCents < 100) {
    return c.json({ error: 'Minimum deposit is $1.00 (100 cents)' }, 400);
  }
  if (amountCents > 100_000) {
    return c.json({ error: 'Maximum deposit is $1,000.00' }, 400);
  }

  const stripe = getStripe();
  const origin = new URL(c.req.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: amountCents,
        product_data: {
          name: 'OpenClaw Balance Deposit',
          description: `Add $${(amountCents / 100).toFixed(2)} to your OpenClaw balance`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      type: 'balance_deposit',
      userId: user.sub,
      amountCents: String(amountCents),
    },
    success_url: `${origin}/?deposit=success`,
    cancel_url: `${origin}/?deposit=cancelled`,
  });

  return c.json({ checkoutUrl: session.url });
});

// ── Search listings (agent-optimized) ───────────────
agentTradeRouter.get('/search', async (c) => {
  const provider = c.req.query('provider');
  const maxPrice = c.req.query('maxPrice');
  const autoMatchOnly = c.req.query('autoMatch') === 'true';

  let query = db.select({
    id: listings.id,
    provider: listings.provider,
    title: listings.title,
    askingPrice: listings.askingPrice,
    faceValue: listings.faceValue,
    creditType: listings.creditType,
    autoMatch: listings.autoMatch,
    sellerUsername: users.username,
    createdAt: listings.createdAt,
  })
    .from(listings)
    .leftJoin(users, eq(listings.userId, users.id))
    .where(and(
      eq(listings.status, 'active'),
      eq(listings.type, 'selling'),
      ...(provider ? [sql`LOWER(${listings.provider}) = LOWER(${provider})`] : []),
      ...(maxPrice ? [sql`${listings.askingPrice} <= ${Number(maxPrice)}`] : []),
      ...(autoMatchOnly ? [eq(listings.autoMatch, true)] : []),
    ))
    .orderBy(listings.askingPrice)
    .$dynamic();

  const results = await query;
  return c.json(results);
});

// ── Market data (price aggregates) ──────────────────
agentTradeRouter.get('/market-data', async (c) => {
  const results = await db.select({
    provider: listings.provider,
    count: sql<number>`count(*)::int`,
    minPrice: sql<number>`min(${listings.askingPrice})`,
    maxPrice: sql<number>`max(${listings.askingPrice})`,
    avgPrice: sql<number>`round(avg(${listings.askingPrice}))::int`,
  })
    .from(listings)
    .where(and(eq(listings.status, 'active'), eq(listings.type, 'selling')))
    .groupBy(listings.provider);

  return c.json(results);
});

// ── Instant Buy ─────────────────────────────────────
agentTradeRouter.post('/buy', requireAuth, async (c) => {
  const user = c.get('user')!;
  const agentKeyId = c.get('agentKeyId');
  const { listingId } = await c.req.json();

  if (!listingId) return c.json({ error: 'listingId required' }, 400);

  // get listing
  const [listing] = await db.select().from(listings)
    .where(eq(listings.id, listingId)).limit(1);

  if (!listing) return c.json({ error: 'Listing not found' }, 404);
  if (listing.type !== 'selling') return c.json({ error: 'Not a selling listing' }, 400);
  if (listing.status !== 'active') return c.json({ error: 'Listing not active' }, 400);
  if (!listing.autoMatch) return c.json({ error: 'Listing does not support instant buy' }, 400);
  if (listing.userId === user.sub) return c.json({ error: 'Cannot buy your own listing' }, 400);

  const amountCents = listing.askingPrice;
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT / 100);
  const sellerPayoutCents = amountCents - platformFeeCents;

  // check buyer balance
  const [buyer] = await db.select({ balanceCents: users.balanceCents })
    .from(users).where(eq(users.id, user.sub)).limit(1);

  if (!buyer || buyer.balanceCents < amountCents) {
    return c.json({
      error: 'Insufficient balance',
      required: amountCents,
      available: buyer?.balanceCents || 0,
    }, 400);
  }

  // atomic: debit buyer, credit seller, create transaction, log ledger
  const [tx] = await db.insert(transactions).values({
    listingId,
    buyerId: user.sub,
    sellerId: listing.userId,
    amountCents,
    platformFeeCents,
    sellerPayoutCents,
    status: 'paid',
  }).returning();

  // debit buyer
  await db.update(users)
    .set({ balanceCents: sql`${users.balanceCents} - ${amountCents}` })
    .where(eq(users.id, user.sub));

  // credit seller
  await db.update(users)
    .set({ balanceCents: sql`${users.balanceCents} + ${sellerPayoutCents}` })
    .where(eq(users.id, listing.userId));

  // ledger entries
  await db.insert(balanceLedger).values([
    {
      userId: user.sub,
      amountCents: -amountCents,
      type: 'purchase',
      referenceId: tx.id,
    },
    {
      userId: listing.userId,
      amountCents: sellerPayoutCents,
      type: 'sale_payout',
      referenceId: tx.id,
    },
  ]);

  // set auto-release
  const autoReleaseAt = new Date(Date.now() + AUTO_RELEASE_HOURS * 60 * 60 * 1000);
  await db.update(transactions)
    .set({ autoReleaseAt, updatedAt: new Date() })
    .where(eq(transactions.id, tx.id));

  // update agent profile stats if agent key used
  if (agentKeyId) {
    await db.update(agentProfiles)
      .set({
        tradesCompleted: sql`${agentProfiles.tradesCompleted} + 1`,
        totalVolumeCents: sql`${agentProfiles.totalVolumeCents} + ${amountCents}`,
        reputationScore: sql`CASE WHEN ${agentProfiles.tradesCompleted} + 1 > 0
          THEN round((${agentProfiles.tradesCompleted} + 1)::numeric / (${agentProfiles.tradesCompleted} + 1 + ${agentProfiles.tradesDisputed})::numeric, 2)
          ELSE 1.00 END`,
      })
      .where(eq(agentProfiles.agentKeyId, agentKeyId));
  }

  return c.json({
    transactionId: tx.id,
    amountCents,
    platformFeeCents,
    sellerPayoutCents,
    status: 'paid',
    autoReleaseAt,
  });
});

// ── Create listing (agent-optimized) ────────────────
agentTradeRouter.post('/list', requireAuth, async (c) => {
  const user = c.get('user')!;
  const agentKeyId = c.get('agentKeyId');
  const body = await c.req.json();

  const { provider, title, askingPrice, creditType, description, faceValue, contactInfo, autoMatch } = body;

  if (!provider || !title || !askingPrice || !creditType) {
    return c.json({ error: 'provider, title, askingPrice, creditType required' }, 400);
  }

  const [listing] = await db.insert(listings).values({
    userId: user.sub,
    type: 'selling',
    provider,
    title,
    description: description || null,
    faceValue: faceValue ? Number(faceValue) : null,
    askingPrice: Number(askingPrice),
    creditType,
    contactInfo: contactInfo || 'agent-managed',
    autoMatch: autoMatch !== false, // default true for agent listings
    agentKeyId: agentKeyId || null,
  }).returning();

  return c.json(listing, 201);
});

// ── Transaction status ──────────────────────────────
agentTradeRouter.get('/status', requireAuth, async (c) => {
  const user = c.get('user')!;

  const txs = await db.select({
    id: transactions.id,
    listingId: transactions.listingId,
    amountCents: transactions.amountCents,
    status: transactions.status,
    autoReleaseAt: transactions.autoReleaseAt,
    createdAt: transactions.createdAt,
    listingTitle: listings.title,
    listingProvider: listings.provider,
  })
    .from(transactions)
    .leftJoin(listings, eq(transactions.listingId, listings.id))
    .where(sql`${transactions.buyerId} = ${user.sub} OR ${transactions.sellerId} = ${user.sub}`)
    .orderBy(desc(transactions.createdAt))
    .limit(20);

  return c.json(txs);
});

export default agentTradeRouter;
