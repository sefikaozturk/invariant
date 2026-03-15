import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { agentKeys, users } from '../db/schema.js';
import type { JWTPayload } from '../lib/jwt.js';

// in-memory rate limit tracking per agent key
const agentRateLimits = new Map<string, number[]>();

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, timestamps] of agentRateLimits) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) agentRateLimits.delete(key);
    else agentRateLimits.set(key, filtered);
  }
}, 60_000);

export async function resolveAgentAuth(
  token: string
): Promise<{ user: JWTPayload; agentKeyId: string } | null> {
  const hash = createHash('sha256').update(token).digest('hex');

  const [key] = await db
    .select({
      id: agentKeys.id,
      userId: agentKeys.userId,
      rateLimit: agentKeys.rateLimit,
      revoked: agentKeys.revoked,
    })
    .from(agentKeys)
    .where(and(eq(agentKeys.keyHash, hash), eq(agentKeys.revoked, false)))
    .limit(1);

  if (!key) return null;

  // rate limit check
  const now = Date.now();
  const timestamps = (agentRateLimits.get(key.id) || []).filter(t => t > now - 60_000);
  if (timestamps.length >= key.rateLimit) return null;
  timestamps.push(now);
  agentRateLimits.set(key.id, timestamps);

  // get user
  const [user] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, key.userId))
    .limit(1);

  if (!user) return null;

  // update last_used_at (fire-and-forget)
  db.update(agentKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentKeys.id, key.id))
    .then(() => {});

  return {
    user: { sub: user.id, username: user.username },
    agentKeyId: key.id,
  };
}
