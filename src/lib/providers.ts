/**
 * Provider Registry
 *
 * Invariant knows about hundreds of API providers. For each one it stores:
 * - Retail pricing (so agents see exactly how much the marketplace saves them)
 * - Signup / docs URLs (so direct provisioning can navigate there)
 * - Whether automated signup is currently supported
 *
 * Unknown providers are still accepted — the provisioner treats them as
 * "custom" and attempts best-effort direct provisioning.
 */

export interface ProviderEntry {
  name: string;
  category: 'ai' | 'cloud' | 'comms' | 'payments' | 'data' | 'devtools' | 'auth' | 'search' | 'monitoring' | 'other';
  signupUrl: string;
  docsUrl: string;
  hasFreeTier: boolean;
  freeCreditsAmountCents?: number;
  defaultCreditAmountCents: number; // standard top-up at retail
  directProvisionSupported: boolean;
}

// Keyed by lowercase, canonical provider name
const registry: Record<string, ProviderEntry> = {
  // ── AI / LLM ──────────────────────────────────────────────────────
  openai: {
    name: 'OpenAI',
    category: 'ai',
    signupUrl: 'https://platform.openai.com/signup',
    docsUrl: 'https://platform.openai.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 500,
    defaultCreditAmountCents: 5_000,
    directProvisionSupported: true,
  },
  anthropic: {
    name: 'Anthropic',
    category: 'ai',
    signupUrl: 'https://console.anthropic.com/',
    docsUrl: 'https://docs.anthropic.com/',
    hasFreeTier: true,
    freeCreditsAmountCents: 500,
    defaultCreditAmountCents: 10_000,
    directProvisionSupported: true,
  },
  mistral: {
    name: 'Mistral',
    category: 'ai',
    signupUrl: 'https://console.mistral.ai/',
    docsUrl: 'https://docs.mistral.ai/',
    hasFreeTier: true,
    freeCreditsAmountCents: 500,
    defaultCreditAmountCents: 2_500,
    directProvisionSupported: true,
  },
  cohere: {
    name: 'Cohere',
    category: 'ai',
    signupUrl: 'https://dashboard.cohere.com/welcome/register',
    docsUrl: 'https://docs.cohere.com/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 5_000,
    directProvisionSupported: true,
  },
  groq: {
    name: 'Groq',
    category: 'ai',
    signupUrl: 'https://console.groq.com/',
    docsUrl: 'https://console.groq.com/docs/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 2_500,
    directProvisionSupported: true,
  },
  replicate: {
    name: 'Replicate',
    category: 'ai',
    signupUrl: 'https://replicate.com/',
    docsUrl: 'https://replicate.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 5_000,
    directProvisionSupported: true,
  },
  'together ai': {
    name: 'Together AI',
    category: 'ai',
    signupUrl: 'https://api.together.xyz/',
    docsUrl: 'https://docs.together.ai/',
    hasFreeTier: true,
    freeCreditsAmountCents: 2_500,
    defaultCreditAmountCents: 5_000,
    directProvisionSupported: true,
  },
  deepseek: {
    name: 'DeepSeek',
    category: 'ai',
    signupUrl: 'https://platform.deepseek.com/',
    docsUrl: 'https://platform.deepseek.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 500,
    defaultCreditAmountCents: 2_500,
    directProvisionSupported: true,
  },
  elevenlabs: {
    name: 'ElevenLabs',
    category: 'ai',
    signupUrl: 'https://elevenlabs.io/',
    docsUrl: 'https://elevenlabs.io/docs/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 5_000,
    directProvisionSupported: true,
  },

  // ── Cloud / Infra ─────────────────────────────────────────────────
  aws: {
    name: 'AWS',
    category: 'cloud',
    signupUrl: 'https://aws.amazon.com/',
    docsUrl: 'https://docs.aws.amazon.com/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 50_000,
    directProvisionSupported: false, // requires identity verification
  },
  'google cloud': {
    name: 'Google Cloud',
    category: 'cloud',
    signupUrl: 'https://console.cloud.google.com/',
    docsUrl: 'https://cloud.google.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 30_000,
    defaultCreditAmountCents: 20_000,
    directProvisionSupported: false,
  },
  vercel: {
    name: 'Vercel',
    category: 'cloud',
    signupUrl: 'https://vercel.com/signup',
    docsUrl: 'https://vercel.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 10_000,
    directProvisionSupported: true,
  },
  supabase: {
    name: 'Supabase',
    category: 'cloud',
    signupUrl: 'https://supabase.com/dashboard',
    docsUrl: 'https://supabase.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 2_500,
    directProvisionSupported: true,
  },
  railway: {
    name: 'Railway',
    category: 'cloud',
    signupUrl: 'https://railway.app/',
    docsUrl: 'https://docs.railway.app/',
    hasFreeTier: true,
    freeCreditsAmountCents: 500,
    defaultCreditAmountCents: 2_000,
    directProvisionSupported: true,
  },
  'digital ocean': {
    name: 'DigitalOcean',
    category: 'cloud',
    signupUrl: 'https://cloud.digitalocean.com/registrations/new',
    docsUrl: 'https://docs.digitalocean.com/',
    hasFreeTier: true,
    freeCreditsAmountCents: 20_000,
    defaultCreditAmountCents: 10_000,
    directProvisionSupported: false,
  },

  // ── Comms ─────────────────────────────────────────────────────────
  twilio: {
    name: 'Twilio',
    category: 'comms',
    signupUrl: 'https://www.twilio.com/try-twilio',
    docsUrl: 'https://www.twilio.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 1_550,
    defaultCreditAmountCents: 5_000,
    directProvisionSupported: true,
  },
  resend: {
    name: 'Resend',
    category: 'comms',
    signupUrl: 'https://resend.com/signup',
    docsUrl: 'https://resend.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 2_000,
    directProvisionSupported: true,
  },
  sendgrid: {
    name: 'SendGrid',
    category: 'comms',
    signupUrl: 'https://signup.sendgrid.com/',
    docsUrl: 'https://docs.sendgrid.com/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 2_000,
    directProvisionSupported: true,
  },

  // ── Payments ──────────────────────────────────────────────────────
  stripe: {
    name: 'Stripe',
    category: 'payments',
    signupUrl: 'https://dashboard.stripe.com/register',
    docsUrl: 'https://stripe.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 0, // pay-as-you-go
    directProvisionSupported: true,
  },

  // ── Data ──────────────────────────────────────────────────────────
  pinecone: {
    name: 'Pinecone',
    category: 'data',
    signupUrl: 'https://app.pinecone.io/',
    docsUrl: 'https://docs.pinecone.io/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 7_000,
    directProvisionSupported: true,
  },
  upstash: {
    name: 'Upstash',
    category: 'data',
    signupUrl: 'https://console.upstash.com/',
    docsUrl: 'https://upstash.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 1_000,
    directProvisionSupported: true,
  },
  neon: {
    name: 'Neon',
    category: 'data',
    signupUrl: 'https://console.neon.tech/signup',
    docsUrl: 'https://neon.tech/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 1_900,
    directProvisionSupported: true,
  },

  // ── Search ────────────────────────────────────────────────────────
  algolia: {
    name: 'Algolia',
    category: 'search',
    signupUrl: 'https://www.algolia.com/users/sign_up',
    docsUrl: 'https://www.algolia.com/doc/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 5_000,
    directProvisionSupported: true,
  },

  // ── Auth ──────────────────────────────────────────────────────────
  auth0: {
    name: 'Auth0',
    category: 'auth',
    signupUrl: 'https://auth0.com/signup',
    docsUrl: 'https://auth0.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 2_300,
    directProvisionSupported: true,
  },
  clerk: {
    name: 'Clerk',
    category: 'auth',
    signupUrl: 'https://dashboard.clerk.com/sign-up',
    docsUrl: 'https://clerk.com/docs',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 2_500,
    directProvisionSupported: true,
  },

  // ── Monitoring ────────────────────────────────────────────────────
  sentry: {
    name: 'Sentry',
    category: 'monitoring',
    signupUrl: 'https://sentry.io/signup/',
    docsUrl: 'https://docs.sentry.io/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 2_600,
    directProvisionSupported: true,
  },
  datadog: {
    name: 'Datadog',
    category: 'monitoring',
    signupUrl: 'https://www.datadoghq.com/',
    docsUrl: 'https://docs.datadoghq.com/',
    hasFreeTier: true,
    freeCreditsAmountCents: 0,
    defaultCreditAmountCents: 5_000,
    directProvisionSupported: false,
  },
};

/**
 * Look up a provider by name. Case-insensitive, fuzzy-tolerant.
 * Returns null for truly unknown providers.
 */
export function lookupProvider(input: string): ProviderEntry | null {
  const key = input.toLowerCase().trim();

  // Exact match
  if (registry[key]) return registry[key];

  // Match by canonical name (case-insensitive)
  for (const entry of Object.values(registry)) {
    if (entry.name.toLowerCase() === key) return entry;
  }

  // Partial / fuzzy: "gcp" → Google Cloud, "openai" → OpenAI, etc.
  const aliases: Record<string, string> = {
    gcp: 'google cloud',
    gce: 'google cloud',
    'vertex ai': 'google cloud',
    'amazon': 'aws',
    'amazon web services': 'aws',
    'digital ocean': 'digital ocean',
    digitalocean: 'digital ocean',
    'claude': 'anthropic',
    'gpt': 'openai',
    'chatgpt': 'openai',
    'together': 'together ai',
    'togetherai': 'together ai',
    'eleven labs': 'elevenlabs',
    '11labs': 'elevenlabs',
    'send grid': 'sendgrid',
    'pg': 'neon',
    'postgres': 'neon',
  };

  if (aliases[key] && registry[aliases[key]]) return registry[aliases[key]];

  return null;
}

/**
 * Get all known providers.
 */
export function allProviders(): ProviderEntry[] {
  return Object.values(registry);
}

/**
 * Construct a synthetic entry for an unknown provider.
 * The provisioner will accept any string — it just won't have retail pricing.
 */
export function unknownProvider(name: string): ProviderEntry {
  return {
    name,
    category: 'other',
    signupUrl: '',
    docsUrl: '',
    hasFreeTier: false,
    defaultCreditAmountCents: 0,
    directProvisionSupported: false,
  };
}
