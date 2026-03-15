import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyToken, JWTPayload } from '../lib/jwt.js';
import { resolveAgentAuth } from './agent-auth.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload | null;
    agentKeyId: string | null;
  }
}

export async function optionalAuth(c: Context, next: Next) {
  c.set('agentKeyId', null);

  // try cookie first (human)
  const token = getCookie(c, 'token');
  if (token) {
    try {
      const payload = await verifyToken(token);
      c.set('user', payload);
      return next();
    } catch {
      // fall through to bearer
    }
  }

  // try bearer token (agent)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer oc_live_')) {
    const resolved = await resolveAgentAuth(authHeader.slice(7));
    if (resolved) {
      c.set('user', resolved.user);
      c.set('agentKeyId', resolved.agentKeyId);
      return next();
    }
  }

  c.set('user', null);
  await next();
}

export async function requireAuth(c: Context, next: Next) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  await next();
}
