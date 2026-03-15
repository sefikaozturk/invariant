import { pgTable, uuid, integer, text, timestamp, index, boolean, numeric } from 'drizzle-orm/pg-core';

// ── Users ───────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: integer('github_id').unique().notNull(),
  username: text('username').notNull(),
  avatarUrl: text('avatar_url'),
  stripeAccountId: text('stripe_account_id'),
  stripeOnboarded: boolean('stripe_onboarded').default(false).notNull(),
  verificationLevel: text('verification_level').default('none').notNull(),
  balanceCents: integer('balance_cents').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Listings ────────────────────────────────────────
export const listings = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(), // 'selling' | 'buying'
  provider: text('provider').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  faceValue: integer('face_value'), // cents
  askingPrice: integer('asking_price').notNull(), // cents
  creditType: text('credit_type').notNull(),
  proofLink: text('proof_link'),
  proofVerified: boolean('proof_verified').default(false).notNull(),
  contactInfo: text('contact_info').notNull(),
  status: text('status').default('active').notNull(),
  autoMatch: boolean('auto_match').default(false).notNull(),
  agentKeyId: uuid('agent_key_id').references(() => agentKeys.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Transactions ────────────────────────────────────
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').references(() => listings.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  sellerId: uuid('seller_id').references(() => users.id).notNull(),
  amountCents: integer('amount_cents').notNull(),
  platformFeeCents: integer('platform_fee_cents').notNull(),
  sellerPayoutCents: integer('seller_payout_cents').notNull(),
  status: text('status').default('pending_payment').notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeTransferId: text('stripe_transfer_id'),
  autoReleaseAt: timestamp('auto_release_at'),
  disputeReason: text('dispute_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('tx_listing_buyer_idx').on(table.listingId, table.buyerId),
  index('tx_status_idx').on(table.status),
]);

// ── Agent Keys ──────────────────────────────────────
export const agentKeys = pgTable('agent_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(), // first 8 chars for display
  permissions: text('permissions').array().notNull(),
  rateLimit: integer('rate_limit').default(60).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  revoked: boolean('revoked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Balance Ledger ──────────────────────────────────
export const balanceLedger = pgTable('balance_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  amountCents: integer('amount_cents').notNull(), // positive = credit, negative = debit
  type: text('type').notNull(), // 'deposit' | 'purchase' | 'sale_payout' | 'refund'
  referenceId: uuid('reference_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('ledger_user_idx').on(table.userId),
]);

// ── Agent Profiles ──────────────────────────────────
export const agentProfiles = pgTable('agent_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentKeyId: uuid('agent_key_id').references(() => agentKeys.id).notNull(),
  displayName: text('display_name').notNull(),
  framework: text('framework'), // 'claude-code' | 'openai-agents' | 'crewai' | 'custom'
  tradesCompleted: integer('trades_completed').default(0).notNull(),
  tradesDisputed: integer('trades_disputed').default(0).notNull(),
  reputationScore: numeric('reputation_score', { precision: 3, scale: 2 }),
  totalVolumeCents: integer('total_volume_cents').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Messages (chat) ─────────────────────────────────
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('messages_conv_idx').on(table.listingId, table.buyerId, table.createdAt),
]);

// ── Direct Messages ─────────────────────────────────
export const directMessages = pgTable('direct_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  senderId: uuid('sender_id').references(() => users.id).notNull(),
  receiverId: uuid('receiver_id').references(() => users.id).notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('dm_conv_idx').on(table.senderId, table.receiverId, table.createdAt),
]);
