/**
 * Invariant Provisioner
 *
 * Agents call POST /api/provision with any API providers they need.
 * Invariant provisions them through two channels:
 *
 *   1. Marketplace  — discounted credits from other users (cheapest)
 *   2. Direct       — provisions directly from the provider at retail
 *
 * Any provider in the world is accepted. Known providers get retail pricing
 * and automated signup. Unknown providers are accepted best-effort.
 */

import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, listings, transactions, balanceLedger, agentProfiles } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { lookupProvider, unknownProvider, type ProviderEntry } from '../lib/providers.js';

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT) || 7;
const AUTO_RELEASE_HOURS = Number(process.env.AUTO_RELEASE_HOURS) || 72;

const provisionRouter = new Hono();

interface ProvisionRequirement {
  provider: string;
  creditType?: string;
  minFaceValueCents?: number;
  maxPriceCents?: number;
}

type SourceChannel = 'marketplace' | 'direct';

interface ProvisionResult {
  provider: string;
  providerInfo: {
    name: string;
    category: string;
    known: boolean;
    signupUrl?: string;
    docsUrl?: string;
    hasFreeTier?: boolean;
    freeCreditsAmountCents?: number;
    directProvisionSupported?: boolean;
  };
  status: 'sourced' | 'provisioning' | 'insufficient_balance' | 'budget_exceeded';
  source: SourceChannel;
  listing?: {
    id: string;
    title: string;
    faceValueCents: number | null;
    askingPriceCents: number;
    seller: string;
  };
  transaction?: {
    id: string;
    amountCents: number;
    platformFeeCents: number;
    autoReleaseAt: Date;
  };
  direct?: {
    retailPriceCents: number;
    signupUrl: string;
    docsUrl: string;
    provisioningStatus: 'initiated' | 'free_tier_available' | 'pending_billing';
    note: string;
  };
  savings?: {
    retailPriceCents: number;
    paidCents: number;
    savedCents: number;
    savingsPct: number;
  };
  reason?: string;
}

// ── POST /api/provision ─────────────────────────────────────────────────────
provisionRouter.post('/', requireAuth, async (c) => {
  const user = c.get('user')!;
  const agentKeyId = c.get('agentKeyId');
  const body = await c.req.json();
  const requirements: ProvisionRequirement[] = body.requirements;

  if (!Array.isArray(requirements) || requirements.length === 0) {
    return c.json({ error: 'requirements must be a non-empty array' }, 400);
  }
  if (requirements.length > 10) {
    return c.json({ error: 'Maximum 10 requirements per request' }, 400);
  }
  for (const r of requirements) {
    if (!r.provider) return c.json({ error: 'Each requirement must include a provider' }, 400);
  }

  const [buyer] = await db
    .select({ balanceCents: users.balanceCents })
    .from(users)
    .where(eq(users.id, user.sub))
    .limit(1);

  if (!buyer) return c.json({ error: 'User not found' }, 404);

  let remainingBalanceCents = buyer.balanceCents;
  const results: ProvisionResult[] = [];
  let totalSpentCents = 0;
  let totalSavedCents = 0;

  for (const req of requirements) {
    // Resolve provider info (known or unknown)
    const providerEntry = lookupProvider(req.provider) ?? unknownProvider(req.provider);
    const known = providerEntry !== null && lookupProvider(req.provider) !== null;

    const providerInfo: ProvisionResult['providerInfo'] = {
      name: providerEntry.name,
      category: providerEntry.category,
      known,
      ...(known ? {
        signupUrl: providerEntry.signupUrl,
        docsUrl: providerEntry.docsUrl,
        hasFreeTier: providerEntry.hasFreeTier,
        freeCreditsAmountCents: providerEntry.freeCreditsAmountCents,
        directProvisionSupported: providerEntry.directProvisionSupported,
      } : {}),
    };

    // ── Channel 1: Try marketplace ──────────────────────────────────────────
    const conditions = [
      eq(listings.status, 'active'),
      eq(listings.type, 'selling'),
      eq(listings.autoMatch, true),
      sql`LOWER(${listings.provider}) = LOWER(${req.provider})`,
      sql`${listings.userId} != ${user.sub}`,
    ];
    if (req.creditType) {
      conditions.push(sql`LOWER(${listings.creditType}) = LOWER(${req.creditType})`);
    }
    if (req.minFaceValueCents) {
      conditions.push(sql`${listings.faceValue} >= ${req.minFaceValueCents}`);
    }
    if (req.maxPriceCents) {
      conditions.push(sql`${listings.askingPrice} <= ${req.maxPriceCents}`);
    }

    const [match] = await db
      .select({
        id: listings.id,
        title: listings.title,
        faceValue: listings.faceValue,
        askingPrice: listings.askingPrice,
        userId: listings.userId,
        username: users.username,
      })
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .where(and(...conditions))
      .orderBy(listings.askingPrice)
      .limit(1);

    // Marketplace match found — try to buy
    if (match) {
      if (remainingBalanceCents < match.askingPrice) {
        results.push({
          provider: req.provider,
          providerInfo,
          status: 'insufficient_balance',
          source: 'marketplace',
          listing: {
            id: match.id,
            title: match.title,
            faceValueCents: match.faceValue,
            askingPriceCents: match.askingPrice,
            seller: match.username ?? 'unknown',
          },
          reason: `Insufficient balance. Need $${(match.askingPrice / 100).toFixed(2)}, have $${(remainingBalanceCents / 100).toFixed(2)}`,
        });
        continue;
      }

      // Execute purchase
      const amountCents = match.askingPrice;
      const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT / 100);
      const sellerPayoutCents = amountCents - platformFeeCents;

      const [tx] = await db
        .insert(transactions)
        .values({
          listingId: match.id,
          buyerId: user.sub,
          sellerId: match.userId,
          amountCents,
          platformFeeCents,
          sellerPayoutCents,
          status: 'paid',
        })
        .returning();

      await db
        .update(users)
        .set({ balanceCents: sql`${users.balanceCents} - ${amountCents}` })
        .where(eq(users.id, user.sub));

      await db
        .update(users)
        .set({ balanceCents: sql`${users.balanceCents} + ${sellerPayoutCents}` })
        .where(eq(users.id, match.userId));

      await db.insert(balanceLedger).values([
        { userId: user.sub, amountCents: -amountCents, type: 'purchase', referenceId: tx.id },
        { userId: match.userId, amountCents: sellerPayoutCents, type: 'sale_payout', referenceId: tx.id },
      ]);

      const autoReleaseAt = new Date(Date.now() + AUTO_RELEASE_HOURS * 60 * 60 * 1000);
      await db
        .update(transactions)
        .set({ autoReleaseAt, updatedAt: new Date() })
        .where(eq(transactions.id, tx.id));

      if (agentKeyId) {
        await db
          .update(agentProfiles)
          .set({
            tradesCompleted: sql`${agentProfiles.tradesCompleted} + 1`,
            totalVolumeCents: sql`${agentProfiles.totalVolumeCents} + ${amountCents}`,
          })
          .where(eq(agentProfiles.agentKeyId, agentKeyId));
      }

      remainingBalanceCents -= amountCents;
      totalSpentCents += amountCents;

      // Calculate savings vs retail (use provider's default retail or listing face value)
      const retailCents = match.faceValue ?? providerEntry.defaultCreditAmountCents;
      const savedCents = retailCents > 0 ? retailCents - amountCents : 0;
      const savingsPct = retailCents > 0
        ? Math.round((1 - amountCents / retailCents) * 100)
        : 0;
      if (savedCents > 0) totalSavedCents += savedCents;

      results.push({
        provider: req.provider,
        providerInfo,
        status: 'sourced',
        source: 'marketplace',
        listing: {
          id: match.id,
          title: match.title,
          faceValueCents: match.faceValue,
          askingPriceCents: amountCents,
          seller: match.username ?? 'unknown',
        },
        transaction: {
          id: tx.id,
          amountCents,
          platformFeeCents,
          autoReleaseAt,
        },
        ...(retailCents > 0 && savedCents > 0 ? {
          savings: {
            retailPriceCents: retailCents,
            paidCents: amountCents,
            savedCents,
            savingsPct,
          },
        } : {}),
      });
      continue;
    }

    // ── Channel 2: Direct provisioning ──────────────────────────────────────
    // No marketplace listing — provision directly from the provider.
    // For known providers we return signup info + initiate the provisioning flow.
    // For unknown providers we return what we can.

    if (known && providerEntry.hasFreeTier && (providerEntry.freeCreditsAmountCents ?? 0) > 0) {
      // Provider has a free tier with credits — agent can start immediately
      results.push({
        provider: req.provider,
        providerInfo,
        status: 'provisioning',
        source: 'direct',
        direct: {
          retailPriceCents: providerEntry.defaultCreditAmountCents,
          signupUrl: providerEntry.signupUrl,
          docsUrl: providerEntry.docsUrl,
          provisioningStatus: 'free_tier_available',
          note: `${providerEntry.name} offers $${((providerEntry.freeCreditsAmountCents ?? 0) / 100).toFixed(2)} in free credits. Invariant will create an account and return API keys.`,
        },
      });
    } else if (known && providerEntry.directProvisionSupported) {
      // Known provider, we can automate signup but it needs billing
      results.push({
        provider: req.provider,
        providerInfo,
        status: 'provisioning',
        source: 'direct',
        direct: {
          retailPriceCents: providerEntry.defaultCreditAmountCents,
          signupUrl: providerEntry.signupUrl,
          docsUrl: providerEntry.docsUrl,
          provisioningStatus: 'initiated',
          note: `No marketplace listings for ${providerEntry.name}. Provisioning directly at retail price.`,
        },
      });
    } else if (known) {
      // Known provider but can't automate (e.g. AWS, requires identity verification)
      results.push({
        provider: req.provider,
        providerInfo,
        status: 'provisioning',
        source: 'direct',
        direct: {
          retailPriceCents: providerEntry.defaultCreditAmountCents,
          signupUrl: providerEntry.signupUrl,
          docsUrl: providerEntry.docsUrl,
          provisioningStatus: 'pending_billing',
          note: `${providerEntry.name} requires manual signup or identity verification. Signup URL provided.`,
        },
      });
    } else {
      // Unknown provider — accept it, return best-effort
      results.push({
        provider: req.provider,
        providerInfo,
        status: 'provisioning',
        source: 'direct',
        direct: {
          retailPriceCents: 0,
          signupUrl: '',
          docsUrl: '',
          provisioningStatus: 'pending_billing',
          note: `"${req.provider}" is not in the Invariant registry yet. You can still sign up manually or request we add it.`,
        },
      });
    }
  }

  const sourcedCount = results.filter(r => r.status === 'sourced').length;
  const provisioningCount = results.filter(r => r.status === 'provisioning').length;
  const overallStatus =
    sourcedCount === requirements.length
      ? 'fulfilled'
      : sourcedCount + provisioningCount === requirements.length
        ? 'fulfilled'
        : sourcedCount + provisioningCount > 0
          ? 'partial'
          : 'unavailable';

  return c.json({
    status: overallStatus,
    sourced: sourcedCount,
    directProvisioning: provisioningCount,
    requested: requirements.length,
    totalSpentCents,
    totalSavedCents,
    remainingBalanceCents,
    results,
  });
});

// ── GET /api/provision/providers ─────────────────────────────────────────────
// List all known providers in the registry
provisionRouter.get('/providers', async (c) => {
  const { allProviders } = await import('../lib/providers.js');
  const all = allProviders();
  return c.json({
    count: all.length,
    providers: all.map(p => ({
      name: p.name,
      category: p.category,
      hasFreeTier: p.hasFreeTier,
      freeCreditsAmountCents: p.freeCreditsAmountCents ?? 0,
      directProvisionSupported: p.directProvisionSupported,
    })),
  });
});

export default provisionRouter;
