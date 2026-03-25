/**
 * Invariant Demo
 *
 * Shows the full product: an agent building a project tells Invariant
 * what APIs it needs. Invariant provisions them automatically —
 * sourcing from the marketplace when discounted credits exist,
 * falling back to direct provisioning from the provider at retail.
 *
 * Any provider in the world. One endpoint.
 *
 * Usage:
 *   npm run demo
 *   BASE_URL=http://localhost:3001 npm run demo
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';

// ── ANSI ──────────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m',
  magenta: '\x1b[35m', red: '\x1b[31m', white: '\x1b[37m', gray: '\x1b[90m',
};

const ok  = (s: string) => console.log(`  ${c.green}✓${c.reset} ${s}`);
const inf = (l: string, v: string) => console.log(`  ${c.gray}${l.padEnd(20)}${c.reset}${v}`);
const hdr = (s: string) => { console.log(); console.log(`${c.bold}${c.cyan}${s}${c.reset}`); console.log(); };
const div = () => console.log(`${c.gray}${'─'.repeat(64)}${c.reset}`);
const $   = (n: number) => `${c.green}$${(n / 100).toFixed(2)}${c.reset}`;
const tag = (s: string) => `${c.yellow}${c.bold}${s}${c.reset}`;
const nl  = () => console.log();

// ── HTTP ──────────────────────────────────────────────────────────────────────
async function api(
  method: string, path: string,
  opts: { body?: unknown; jwt?: string; agentKey?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.jwt) headers['Cookie'] = `token=${opts.jwt}`;
  if (opts.agentKey) headers['Authorization'] = `Bearer ${opts.agentKey}`;
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  nl();
  console.log(`${c.bold}${c.cyan}  Invariant${c.reset}  ${c.dim}— provision any API, for any agent${c.reset}`);
  console.log(`  ${c.gray}${BASE}${c.reset}`);
  div();

  // ── Scenario ──────────────────────────────────────────────────────────────
  nl();
  console.log(`${c.bold}  The scenario:${c.reset}`);
  nl();
  console.log(`  ${c.dim}You tell your coding agent:${c.reset}`);
  console.log(`  ${c.white}${c.bold}"Build me a RAG chatbot. Use OpenAI for embeddings,`);
  console.log(`   Anthropic for inference, Pinecone for vectors, Resend`);
  console.log(`   for email notifications, and deploy it on Vercel."${c.reset}`);
  nl();
  console.log(`  ${c.dim}That's 5 API providers. Normally: 5 sign-up flows, 5 billing`);
  console.log(`  pages, 5 sets of keys to copy-paste. With Invariant: one call.${c.reset}`);
  nl();
  div();

  // ── Phase 1: Seed ─────────────────────────────────────────────────────────
  hdr('Phase 1  —  Seed the marketplace');
  console.log(`  ${c.dim}(Simulates a marketplace where sellers have listed unused credits)${c.reset}`);
  nl();
  const setup = await api('POST', '/api/demo/setup');
  ok(`Marketplace ready  (${setup.listingsSeeded > 0 ? `${setup.listingsSeeded} listings` : 'already seeded'})`);
  ok(`Agent wallet: ${$(setup.buyer.balanceCents)}`);
  const jwt = setup.token;

  // ── Phase 2: Agent key ────────────────────────────────────────────────────
  hdr('Phase 2  —  Agent registers with Invariant');
  console.log(`  ${c.dim}One-time setup. The agent stores this key in its config.${c.reset}`);
  nl();

  const keyRes = await api('POST', '/api/agent-keys', {
    jwt,
    body: { name: 'rag-builder', displayName: 'RAG Chatbot Builder', framework: 'claude-code' },
  });
  const agentKey: string = keyRes.key;
  ok('Agent key issued');
  inf('Key:', tag(agentKey));
  inf('Rate limit:', `${keyRes.rateLimit} req/min`);

  // ── Phase 3: Check the registry ───────────────────────────────────────────
  hdr('Phase 3  —  What Invariant knows about');
  const registry = await api('GET', '/api/provision/providers');
  ok(`${registry.count} providers in the registry (AI, cloud, comms, data, auth, ...)`);
  nl();

  // Group by category
  const byCategory: Record<string, string[]> = {};
  for (const p of registry.providers) {
    (byCategory[p.category] ??= []).push(p.name);
  }
  for (const [cat, names] of Object.entries(byCategory)) {
    console.log(`  ${c.cyan}${cat.padEnd(12)}${c.reset}${c.dim}${names.join(', ')}${c.reset}`);
  }
  nl();
  console.log(`  ${c.dim}Unknown providers are accepted too — best-effort provisioning.${c.reset}`);

  // ── Phase 4: Provision ────────────────────────────────────────────────────
  hdr('Phase 4  —  Agent provisions everything it needs');

  const requirements = [
    // These exist on the marketplace → sourced at a discount
    { provider: 'OpenAI',    creditType: 'api' },
    { provider: 'Anthropic', creditType: 'api' },
    { provider: 'Vercel' },
    // These don't have marketplace listings → direct provisioning
    { provider: 'Pinecone' },
    { provider: 'Resend' },
  ];

  console.log(`  ${c.dim}POST /api/provision${c.reset}`);
  console.log(`  ${c.gray}{ "requirements": [${c.reset}`);
  for (const r of requirements) {
    const parts = [`"provider": "${r.provider}"`];
    if ('creditType' in r) parts.push(`"creditType": "${r.creditType}"`);
    console.log(`  ${c.gray}    { ${parts.join(', ')} },${c.reset}`);
  }
  console.log(`  ${c.gray}] }${c.reset}`);
  nl();

  const provision = await api('POST', '/api/provision', { agentKey, body: { requirements } });

  // ── Print results ─────────────────────────────────────────────────────────
  const statusColors: Record<string, string> = {
    fulfilled: `${c.green}${c.bold}FULFILLED${c.reset}`,
    partial: `${c.yellow}${c.bold}PARTIAL${c.reset}`,
    unavailable: `${c.red}${c.bold}UNAVAILABLE${c.reset}`,
  };

  console.log(`  Status:  ${statusColors[provision.status] ?? provision.status}`);
  inf('From marketplace:', `${provision.sourced}`);
  inf('Direct provision:', `${provision.directProvisioning}`);
  inf('Total spent:', $(provision.totalSpentCents));
  if (provision.totalSavedCents > 0) {
    inf('Saved vs retail:', `${$(provision.totalSavedCents)}  ${c.dim}(by using marketplace)${c.reset}`);
  }
  nl();
  div();

  for (const r of provision.results) {
    nl();
    const sourceTag = r.source === 'marketplace'
      ? `${c.green}marketplace${c.reset}`
      : `${c.magenta}direct${c.reset}`;
    const statusIcon = r.status === 'sourced'
      ? `${c.green}✓${c.reset}`
      : r.status === 'provisioning'
        ? `${c.magenta}⟳${c.reset}`
        : `${c.yellow}✗${c.reset}`;

    console.log(`  ${statusIcon}  ${c.bold}${r.providerInfo.name}${c.reset}  ${c.dim}via${c.reset} ${sourceTag}  ${c.dim}(${r.providerInfo.category})${c.reset}`);

    if (r.status === 'sourced' && r.listing && r.transaction) {
      inf('  Listing:', r.listing.title);
      inf('  Paid:', $(r.transaction.amountCents));
      if (r.savings) {
        inf('  Retail would be:', $(r.savings.retailPriceCents));
        inf('  You saved:', `${$(r.savings.savedCents)}  ${c.yellow}(${r.savings.savingsPct}% off)${c.reset}`);
      }
      inf('  Tx ID:', `${c.dim}${r.transaction.id}${c.reset}`);
    }

    if (r.status === 'provisioning' && r.direct) {
      const s = r.direct.provisioningStatus;
      if (s === 'free_tier_available') {
        inf('  Status:', `${c.green}Free tier available${c.reset}`);
        inf('  Free credits:', $(r.providerInfo.freeCreditsAmountCents ?? 0));
      } else if (s === 'initiated') {
        inf('  Status:', `${c.magenta}Provisioning initiated${c.reset}`);
        inf('  Retail price:', $(r.direct.retailPriceCents));
      } else {
        inf('  Status:', `${c.yellow}Pending manual setup${c.reset}`);
      }
      if (r.direct.signupUrl) inf('  Signup:', r.direct.signupUrl);
      if (r.direct.docsUrl)   inf('  Docs:', r.direct.docsUrl);
    }
  }

  // ── Phase 5: Balance ──────────────────────────────────────────────────────
  hdr('Phase 5  —  Post-provision state');
  const balRes = await api('GET', '/api/agent/balance', { agentKey });
  ok(`Remaining balance: ${$(balRes.balanceCents)}`);
  const txs = await api('GET', '/api/agent/status', { agentKey });
  ok(`${txs.length} marketplace transaction(s) recorded`);

  // ── Now do something weird ────────────────────────────────────────────────
  hdr('Phase 6  —  Unknown provider (any API in the world)');
  console.log(`  ${c.dim}What happens when the agent needs a niche API that's not in${c.reset}`);
  console.log(`  ${c.dim}the registry and has no marketplace listings?${c.reset}`);
  nl();

  const edgeCase = await api('POST', '/api/provision', {
    agentKey,
    body: { requirements: [{ provider: 'Hetzner Cloud' }, { provider: 'val.town' }] },
  });

  for (const r of edgeCase.results) {
    const icon = r.status === 'provisioning' ? `${c.magenta}⟳${c.reset}` : `${c.green}✓${c.reset}`;
    console.log(`  ${icon}  ${c.bold}${r.provider}${c.reset}  ${c.dim}(${r.providerInfo.known ? 'known' : 'unknown provider'})${c.reset}`);
    if (r.direct?.note) {
      console.log(`     ${c.dim}${r.direct.note}${c.reset}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  nl();
  div();
  nl();
  console.log(`${c.bold}  How it works:${c.reset}`);
  nl();
  console.log(`  ${c.dim}1. Agent calls  POST /api/provision  with any providers it needs.${c.reset}`);
  console.log(`  ${c.dim}2. Invariant checks the marketplace for discounted credits first.${c.reset}`);
  console.log(`  ${c.dim}3. If no marketplace listing: falls back to direct provisioning.${c.reset}`);
  console.log(`  ${c.dim}4. Knows ${registry.count}+ providers. Accepts unknown ones too.${c.reset}`);
  console.log(`  ${c.dim}5. Agent gets a structured receipt and continues building.${c.reset}`);
  nl();
  console.log(`  ${c.bold}The marketplace is the supply layer.${c.reset}`);
  console.log(`  ${c.dim}People sell unused credits at a discount. Agents buy them.${c.reset}`);
  console.log(`  ${c.dim}When no one's selling: Invariant provisions directly.${c.reset}`);
  nl();
  div();
  nl();
  console.log(`${c.bold}  Agent key for testing:${c.reset}`);
  nl();
  console.log(`  ${tag(agentKey)}`);
  nl();
  console.log(`  ${c.gray}# Provision any APIs${c.reset}`);
  console.log(`  curl -X POST ${BASE}/api/provision \\`);
  console.log(`    -H "Authorization: Bearer <key>" \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"requirements":[{"provider":"OpenAI"},{"provider":"Stripe"},{"provider":"anything"}]}'`);
  nl();
  console.log(`  ${c.gray}# List all known providers${c.reset}`);
  console.log(`  curl ${BASE}/api/provision/providers`);
  nl();
}

run().catch((err) => {
  console.error(`\n${c.red}✗${c.reset} ${err.message}`);
  process.exit(1);
});
