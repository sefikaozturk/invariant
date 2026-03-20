/**
 * Invariant Agent API Demo
 *
 * Runs end-to-end: seeds demo data, creates an agent key,
 * searches listings, reads market data, and executes an instant buy.
 *
 * Usage:
 *   npm run demo
 *   BASE_URL=http://localhost:3001 npm run demo
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';

// ── ANSI helpers ────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const fmt = {
  header: (s: string) => `\n${c.bold}${c.cyan}${s}${c.reset}`,
  step: (n: number, s: string) => `\n${c.bold}${c.white}[${n}]${c.reset} ${s}`,
  label: (s: string) => `${c.gray}${s}${c.reset}`,
  value: (s: unknown) => `${c.green}${s}${c.reset}`,
  key: (s: string) => `${c.yellow}${c.bold}${s}${c.reset}`,
  money: (cents: number) => `${c.green}$${(cents / 100).toFixed(2)}${c.reset}`,
  error: (s: string) => `${c.red}✗ ${s}${c.reset}`,
  ok: (s: string) => `${c.green}✓ ${s}${c.reset}`,
  divider: () => `${c.gray}${'─'.repeat(60)}${c.reset}`,
};

function printJson(obj: unknown) {
  const lines = JSON.stringify(obj, null, 2).split('\n');
  for (const line of lines) {
    console.log(`  ${c.dim}${line}${c.reset}`);
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function api(
  method: string,
  path: string,
  opts: { body?: unknown; jwt?: string; agentKey?: string } = {}
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.jwt) headers['Cookie'] = `token=${opts.jwt}`;
  if (opts.agentKey) headers['Authorization'] = `Bearer ${opts.agentKey}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Demo ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(fmt.header('━━━  Invariant Agent API Demo  ━━━'));
  console.log(`${fmt.label('  Target:')} ${BASE}`);
  console.log(fmt.divider());

  // ── Step 1: Seed demo environment ──────────────────────────────────────────
  console.log(fmt.step(1, 'Seeding demo environment...'));
  const setup = await api('POST', '/api/demo/setup');
  console.log(fmt.ok(`Buyer: ${setup.buyer.username}  (balance: ${fmt.money(setup.buyer.balanceCents)})`));
  console.log(fmt.ok(`Seller: ${setup.seller.username}`));
  if (setup.listingsSeeded > 0) {
    console.log(fmt.ok(`Created ${setup.listingsSeeded} seed listings`));
  } else {
    console.log(`  ${fmt.label('Listings already exist — skipping seed')}`);
  }

  const jwt = setup.token as string;

  // ── Step 2: Create agent key ────────────────────────────────────────────────
  console.log(fmt.step(2, 'Creating agent API key...'));
  const keyRes = await api('POST', '/api/agent-keys', {
    jwt,
    body: {
      name: 'demo-agent-v1',
      displayName: 'Demo Agent',
      framework: 'custom',
      permissions: ['listings:read', 'escrow:create', 'escrow:read', 'balance:read', 'balance:write'],
    },
  });

  const agentKey = keyRes.key as string;
  console.log(fmt.ok('Agent key created'));
  console.log(`  ${fmt.label('Name:')}        ${keyRes.name}`);
  console.log(`  ${fmt.label('Key:')}         ${fmt.key(agentKey)}`);
  console.log(`  ${fmt.label('Permissions:')} ${keyRes.permissions.join(', ')}`);
  console.log(`  ${fmt.label('Rate limit:')}  ${keyRes.rateLimit} req/min`);

  // ── Step 3: Market overview ─────────────────────────────────────────────────
  console.log(fmt.step(3, 'Fetching market data...'));
  const market = await api('GET', '/api/agent/market-data', { agentKey });
  console.log(fmt.ok(`${market.length} providers with active listings`));
  console.log();

  const providerCol = 14;
  console.log(
    `  ${c.bold}${'Provider'.padEnd(providerCol)}  Listings  Min Price    Avg Price    Max Price${c.reset}`
  );
  console.log(`  ${'─'.repeat(60)}`);
  for (const row of market) {
    const name = String(row.provider).padEnd(providerCol);
    const count = String(row.count).padStart(4);
    const min = `$${(row.minPrice / 100).toFixed(2)}`.padStart(8);
    const avg = `$${(row.avgPrice / 100).toFixed(2)}`.padStart(8);
    const max = `$${(row.maxPrice / 100).toFixed(2)}`.padStart(8);
    console.log(`  ${c.cyan}${name}${c.reset}  ${count}      ${c.green}${min}${c.reset}       ${avg}       ${max}`);
  }

  // ── Step 4: Search for auto-match listings ───────────────────────────────────
  console.log(fmt.step(4, 'Searching for instant-buy (auto-match) listings...'));
  const search = await api('GET', '/api/agent/search?autoMatch=true', { agentKey });
  console.log(fmt.ok(`${search.length} instant-buy listings found`));
  console.log();

  console.log(
    `  ${c.bold}${'#'.padEnd(3)}  ${'Provider'.padEnd(12)}  ${'Title'.padEnd(32)}  ${'Price'.padStart(8)}  ${'Face'.padStart(8)}  Discount${c.reset}`
  );
  console.log(`  ${'─'.repeat(80)}`);

  for (let i = 0; i < search.length; i++) {
    const l = search[i];
    const discount = l.faceValue
      ? Math.round((1 - l.askingPrice / l.faceValue) * 100)
      : null;
    const discStr = discount != null ? `${discount}% off` : '—';
    const title = String(l.title).slice(0, 32).padEnd(32);
    const price = `$${(l.askingPrice / 100).toFixed(2)}`.padStart(8);
    const face = l.faceValue ? `$${(l.faceValue / 100).toFixed(2)}`.padStart(8) : '     —  ';
    console.log(
      `  ${c.gray}${String(i + 1).padEnd(3)}${c.reset}  ${c.cyan}${String(l.provider).padEnd(12)}${c.reset}  ${title}  ${c.green}${price}${c.reset}  ${c.dim}${face}${c.reset}  ${c.yellow}${discStr}${c.reset}`
    );
  }

  if (search.length === 0) {
    console.log(fmt.error('No auto-match listings found. Cannot proceed with instant buy.'));
    return;
  }

  // ── Step 5: Instant buy ──────────────────────────────────────────────────────
  const target = search[0]; // cheapest (ordered by askingPrice ASC)
  console.log(fmt.step(5, `Executing instant buy: "${target.title}"`));
  console.log(`  ${fmt.label('Listing ID:')} ${target.id}`);
  console.log(`  ${fmt.label('Price:')}      ${fmt.money(target.askingPrice)}`);

  const buyRes = await api('POST', '/api/agent/buy', {
    agentKey,
    body: { listingId: target.id },
  });

  console.log(fmt.ok('Purchase complete!'));
  console.log();
  console.log(`  ${fmt.label('Transaction ID:')}   ${buyRes.transactionId}`);
  console.log(`  ${fmt.label('Amount paid:')}      ${fmt.money(buyRes.amountCents)}`);
  console.log(`  ${fmt.label('Platform fee:')}     ${fmt.money(buyRes.platformFeeCents)}`);
  console.log(`  ${fmt.label('Seller payout:')}    ${fmt.money(buyRes.sellerPayoutCents)}`);
  console.log(`  ${fmt.label('Status:')}           ${c.green}${buyRes.status}${c.reset}`);
  console.log(`  ${fmt.label('Auto-release at:')}  ${new Date(buyRes.autoReleaseAt).toLocaleString()}`);

  // ── Step 6: Check balance ────────────────────────────────────────────────────
  console.log(fmt.step(6, 'Checking updated balance...'));
  const balRes = await api('GET', '/api/agent/balance', { agentKey });
  console.log(fmt.ok(`Remaining balance: ${fmt.money(balRes.balanceCents)}`));

  // ── Step 7: Transaction history ──────────────────────────────────────────────
  console.log(fmt.step(7, 'Transaction history...'));
  const txs = await api('GET', '/api/agent/status', { agentKey });
  console.log(fmt.ok(`${txs.length} transaction(s) on record`));
  const latest = txs[0];
  if (latest) {
    console.log();
    console.log(`  ${fmt.label('Latest:')} ${latest.listingProvider} — ${latest.listingTitle}`);
    console.log(`  ${fmt.label('Amount:')} ${fmt.money(latest.amountCents)}  │  ${fmt.label('Status:')} ${c.green}${latest.status}${c.reset}`);
  }

  // ── Done ──────────────────────────────────────────────────────────────────────
  console.log();
  console.log(fmt.divider());
  console.log(fmt.header('  Demo complete.'));
  console.log();
  console.log(`  Use your agent key in any HTTP client:`);
  console.log(`  ${fmt.label('Authorization: Bearer')} ${fmt.key(agentKey)}`);
  console.log();
  console.log(`  ${fmt.label('Search:')}      curl -H "Authorization: Bearer ${agentKey}" ${BASE}/api/agent/search`);
  console.log(`  ${fmt.label('Market:')}      curl -H "Authorization: Bearer ${agentKey}" ${BASE}/api/agent/market-data`);
  console.log(`  ${fmt.label('Balance:')}     curl -H "Authorization: Bearer ${agentKey}" ${BASE}/api/agent/balance`);
  console.log(`  ${fmt.label('Buy:')}         curl -X POST -H "Authorization: Bearer ${agentKey}" -H "Content-Type: application/json" \\`);
  console.log(`                -d '{"listingId":"<id>"}' ${BASE}/api/agent/buy`);
  console.log();
}

run().catch((err) => {
  console.error(fmt.error(err.message));
  process.exit(1);
});
