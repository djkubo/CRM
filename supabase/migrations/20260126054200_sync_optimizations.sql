-- ============================================
-- Database Optimizations for Sync Functions
-- Created: 2026-01-26
-- Purpose: Add indexes for optimal sync performance
-- ============================================

-- ============================================
-- 1. SYNC_RUNS OPTIMIZATIONS
-- ============================================

-- Composite index for cleanup queries (status + started_at)
CREATE INDEX IF NOT EXISTS idx_sync_runs_status_started_cleanup 
ON public.sync_runs(status, started_at DESC) 
WHERE status IN ('running', 'continuing');

-- Index for active sync detection
CREATE INDEX IF NOT EXISTS idx_sync_runs_source_active 
ON public.sync_runs(source, status) 
WHERE status IN ('running', 'continuing');

-- ============================================
-- 2. CONTACT_IDENTITIES OPTIMIZATIONS
-- ============================================

-- Composite index for source + client_id lookups
CREATE INDEX IF NOT EXISTS idx_contact_identities_source_client 
ON public.contact_identities(source, client_id);

-- Unique constraint on source + external_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_identities_source_external_unique 
ON public.contact_identities(source, external_id);

-- ============================================
-- 3. MERGE_CONFLICTS OPTIMIZATIONS
-- ============================================

-- Index for pending conflicts by source
CREATE INDEX IF NOT EXISTS idx_merge_conflicts_status_source 
ON public.merge_conflicts(status, source, created_at DESC) 
WHERE status = 'pending';

-- ============================================
-- 4. RAW CONTACTS OPTIMIZATIONS
-- ============================================

-- Index for unprocessed GHL contacts
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_unprocessed 
ON public.ghl_contacts_raw(processed_at) 
WHERE processed_at IS NULL;

-- Index for unprocessed ManyChat contacts
CREATE INDEX IF NOT EXISTS idx_manychat_contacts_unprocessed 
ON public.manychat_contacts_raw(processed_at) 
WHERE processed_at IS NULL;

-- Index for sync_run_id lookups
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_sync_run 
ON public.ghl_contacts_raw(sync_run_id);

CREATE INDEX IF NOT EXISTS idx_manychat_contacts_sync_run 
ON public.manychat_contacts_raw(sync_run_id);

-- ============================================
-- 5. CLIENTS OPTIMIZATIONS
-- ============================================

-- Composite index for lifecycle + last_sync queries
CREATE INDEX IF NOT EXISTS idx_clients_lifecycle_lastsync 
ON public.clients(lifecycle_stage, last_sync DESC NULLS LAST);

-- Email case-insensitive for deduplication
CREATE INDEX IF NOT EXISTS idx_clients_email_lower 
ON public.clients(LOWER(email)) 
WHERE email IS NOT NULL;

-- ============================================
-- 6. TRANSACTIONS OPTIMIZATIONS
-- ============================================

-- Index for payment cross-reference queries
CREATE INDEX IF NOT EXISTS idx_transactions_email_status_paid 
ON public.transactions(customer_email, status) 
WHERE status = 'paid';

-- ============================================
-- 7. PERFORMANCE COMMENTS
-- ============================================

COMMENT ON INDEX idx_sync_runs_status_started_cleanup IS 
'Optimizes cleanup queries for stale syncs (30 min timeout detection)';

COMMENT ON INDEX idx_contact_identities_source_client IS 
'Optimizes merge_contact function lookups by source';

COMMENT ON INDEX idx_merge_conflicts_status_source IS 
'Optimizes SyncCenter conflicts tab filtering';

COMMENT ON INDEX idx_clients_email_lower IS 
'Case-insensitive email lookups for deduplication';

-- ============================================
-- 8. VACUUM ANALYZE
-- ============================================

ANALYZE public.sync_runs;
ANALYZE public.contact_identities;
ANALYZE public.merge_conflicts;
ANALYZE public.clients;
ANALYZE public.transactions;
