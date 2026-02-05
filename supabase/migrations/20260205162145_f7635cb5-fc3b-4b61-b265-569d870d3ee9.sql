-- Add dynamic filter support to broadcast_lists
ALTER TABLE public.broadcast_lists 
ADD COLUMN IF NOT EXISTS filter_type TEXT DEFAULT 'static',
ADD COLUMN IF NOT EXISTS filter_criteria JSONB DEFAULT NULL;

-- filter_type: 'static' (manual IDs) or 'dynamic' (query-based)
-- filter_criteria: { lifecycle_stage: 'CUSTOMER', tags: ['VIP'], has_phone: true, etc. }

COMMENT ON COLUMN public.broadcast_lists.filter_type IS 'static = manual member list, dynamic = query-based';
COMMENT ON COLUMN public.broadcast_lists.filter_criteria IS 'JSONB filter for dynamic lists: {lifecycle_stage, tags, has_phone, min_spend}';