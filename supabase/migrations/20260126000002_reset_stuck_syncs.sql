-- Function to reset stuck sync runs
-- This prevents syncs from being blocked indefinitely by timed-out processes
CREATE OR REPLACE FUNCTION public.reset_stuck_syncs(p_timeout_minutes INTEGER DEFAULT 15)
RETURNS TABLE(
  reset_count INTEGER,
  reset_ids TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_time TIMESTAMPTZ;
  v_reset_ids TEXT[];
  v_count INTEGER;
BEGIN
  -- Calculate cutoff time
  v_cutoff_time := NOW() - (p_timeout_minutes || ' minutes')::INTERVAL;
  
  -- Find and update stuck syncs
  WITH stuck_syncs AS (
    UPDATE sync_runs
    SET 
      status = 'error',
      error_message = 'Sync timed out after ' || p_timeout_minutes || ' minutes',
      completed_at = NOW()
    WHERE 
      status IN ('running', 'continuing')
      AND started_at < v_cutoff_time
      AND completed_at IS NULL
    RETURNING id
  )
  SELECT 
    ARRAY_AGG(id::TEXT),
    COUNT(*)::INTEGER
  INTO v_reset_ids, v_count
  FROM stuck_syncs;
  
  -- Return results
  RETURN QUERY SELECT 
    COALESCE(v_count, 0),
    COALESCE(v_reset_ids, ARRAY[]::TEXT[]);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.reset_stuck_syncs(INTEGER) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.reset_stuck_syncs(INTEGER) IS 'Resets sync runs that have been stuck in running/continuing status for longer than the specified timeout (default 15 minutes)';
