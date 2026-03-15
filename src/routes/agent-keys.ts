import { Hono } from 'hono';
import { randomBytes, createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { agentKeys, agentProfiles } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const agentKeysRouter = new Hono();

// create agent key (human auth required)
agentKeysRouter.post('/', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json();
  const { name, permissions, rateLimit: rl, framework, displayName } = body;

  if (!name) return c.json({ error: 'name required' }, 400);

  const rawKey = `oc_live_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 16); // "oc_live_" + first 8 hex

  const validPermissions = permissions?.length
    ? permissions.filter((p: string) =>
        ['listings:read', 'listings:write', 'escrow:create', 'escrow:read', 'balance:read', 'balance:write'].includes(p)
      )
    : ['listings:read', 'escrow:create', 'escrow:read', 'balance:read', 'balance:write'];

  const [key] = await db.insert(agentKeys).values({
    userId: user.sub,
    name,
    keyHash,
    keyPrefix,
    permissions: validPermissions,
    rateLimit: rl || 60,
  }).returning();

  // create agent profile
  await db.insert(agentProfiles).values({
    agentKeyId: key.id,
    displayName: displayName || name,
    framework: framework || 'custom',
  });

  // return the raw key ONCE
  return c.json({
    id: key.id,
    name: key.name,
    key: rawKey,
    prefix: keyPrefix,
    permissions: validPermissions,
    rateLimit: key.rateLimit,
    message: 'Save this key — it will not be shown again.',
  }, 201);
});

// list my keys
agentKeysRouter.get('/', requireAuth, async (c) => {
  const user = c.get('user')!;

  const keys = await db.select({
    id: agentKeys.id,
    name: agentKeys.name,
    keyPrefix: agentKeys.keyPrefix,
    permissions: agentKeys.permissions,
    rateLimit: agentKeys.rateLimit,
    lastUsedAt: agentKeys.lastUsedAt,
    revoked: agentKeys.revoked,
    createdAt: agentKeys.createdAt,
  })
    .from(agentKeys)
    .where(eq(agentKeys.userId, user.sub));

  return c.json(keys);
});

// revoke key
agentKeysRouter.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const [key] = await db.select({ id: agentKeys.id, userId: agentKeys.userId })
    .from(agentKeys)
    .where(eq(agentKeys.id, id))
    .limit(1);

  if (!key) return c.json({ error: 'Not found' }, 404);
  if (key.userId !== user.sub) return c.json({ error: 'Forbidden' }, 403);

  await db.update(agentKeys)
    .set({ revoked: true })
    .where(eq(agentKeys.id, id));

  return c.json({ ok: true });
});

export default agentKeysRouter;
