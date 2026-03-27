import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import auth from './routes/auth.js';
import listingsRouter from './routes/listings.js';
import me from './routes/me.js';
import escrowRouter from './routes/escrow.js';
import agentKeysRouter from './routes/agent-keys.js';
import agentTradeRouter from './routes/agent-trade.js';
import provisionRouter from './routes/provision.js';
import demoRouter from './routes/demo.js';
import { optionalAuth } from './middleware/auth.js';
import { rateLimit } from './lib/rate-limit.js';

const app = new Hono();

app.use('*', logger());
app.use('*', optionalAuth);

// rate limiting
app.use('/api/listings', async (c, next) => {
  if (c.req.method === 'POST') return rateLimit(10)(c, next);
  if (c.req.method === 'GET') return rateLimit(60)(c, next);
  await next();
});
app.use('/api/escrow/*', async (c, next) => {
  if (c.req.method === 'POST') return rateLimit(5)(c, next);
  await next();
});
app.use('/api/agent/*', async (c, next) => {
  if (c.req.method === 'POST') return rateLimit(30)(c, next);
  if (c.req.method === 'GET') return rateLimit(120)(c, next);
  await next();
});

// routes
app.route('/api/auth', auth);
app.route('/api/listings', listingsRouter);
app.route('/api/me', me);
app.route('/api/escrow', escrowRouter);
app.route('/api/agent-keys', agentKeysRouter);
app.route('/api/agent', agentTradeRouter);
app.route('/api/provision', provisionRouter);
app.route('/api/demo', demoRouter);

// static files
app.use('/*', serveStatic({ root: './public' }));
app.get('*', serveStatic({ root: './public', path: 'index.html' }));

const port = Number(process.env.PORT) || 3001;
console.log(`OpenClaw running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
