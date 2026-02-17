
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sync_runs'
      AND column_name = 'timeout_at'
  ) THEN
    ALTER TABLE public.sync_runs
    ADD COLUMN timeout_at TIMESTAMPTZ DEFAULT (now() + interval '10 minutes');

    COMMENT ON COLUMN public.sync_runs.timeout_at IS
      'Auto-set deadline. If status is still running past this time, it is considered a zombie.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sync_runs_running
  ON public.sync_runs (started_at)
  WHERE status = 'running';

NOTIFY pgrst, 'reload schema';
