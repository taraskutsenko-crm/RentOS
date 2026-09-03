-- Havelio Billing (Stage 17) — one-time existing-tenant migration strategy.
--
-- Every tenant that existed before Stage 17 shipped has no HavelioSubscription
-- row (the table did not exist yet). Without this backfill, the very next
-- request from such a tenant would hit SubscriptionsService.getSubscription's
-- "Tenant has no HavelioSubscription row" error — silently locking out every
-- real pre-existing tenant the moment entitlement checks go live.
--
-- This inserts exactly one grandfathered subscription row per tenant that
-- doesn't already have one: isGrandfathered=true, status=ACTIVE,
-- plan=PROFESSIONAL (full existing feature access, matching what these
-- tenants already had before billing existed), no Stripe linkage, no
-- trial/expiry. See HavelioSubscription.isGrandfathered's own doc comment
-- in schema.prisma — this is a one-time migration artifact, never a
-- code-level bypass: a brand new tenant registering after this migration
-- always goes through the real 14-day-trial path (SubscriptionsService.
-- startTrial), never this one.
--
-- Idempotent: only inserts for a tenant with no existing row, so re-running
-- this migration (or applying it to a database that already has some
-- HavelioSubscription rows from tenants registered after Stage 17 shipped)
-- never creates a duplicate or overwrites a real subscription.
INSERT INTO "havelio_subscriptions" (
  "id", "tenantId", "plan", "status", "isGrandfathered", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "id",
  'PROFESSIONAL',
  'ACTIVE',
  true,
  now(),
  now()
FROM "tenants"
WHERE "id" NOT IN (SELECT "tenantId" FROM "havelio_subscriptions");
