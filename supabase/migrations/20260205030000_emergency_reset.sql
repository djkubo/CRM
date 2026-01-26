-- Emergency reset for stuck syncs
UPDATE public.sync_runs 
SET 
  status = 'failed', 
  error_message = 'Emergency manual reset', 
  completed_at = NOW() 
WHERE 
  status IN ('running', 'continuing');
