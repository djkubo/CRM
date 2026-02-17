
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate NUMERIC(14,8) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'manual',
  CONSTRAINT exchange_rates_positive CHECK (rate > 0)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
  ON public.exchange_rates (base_currency, target_currency, fetched_at DESC);

INSERT INTO public.exchange_rates (base_currency, target_currency, rate, source)
VALUES ('MXN', 'USD', 0.05, 'manual')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_exchange_rate(
  p_base TEXT,
  p_target TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  SELECT rate INTO v_rate
  FROM public.exchange_rates
  WHERE base_currency = upper(p_base)
    AND target_currency = upper(p_target)
  ORDER BY fetched_at DESC
  LIMIT 1;

  IF v_rate IS NULL THEN
    IF upper(p_base) = 'MXN' AND upper(p_target) = 'USD' THEN
      RETURN 0.05;
    ELSIF upper(p_base) = 'USD' AND upper(p_target) = 'MXN' THEN
      RETURN 20.0;
    ELSE
      RETURN 1.0;
    END IF;
  END IF;

  RETURN v_rate;
END;
$$;

GRANT SELECT ON public.exchange_rates TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_exchange_rate(TEXT, TEXT) TO authenticated, service_role, anon;

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exchange rates"
  ON public.exchange_rates FOR SELECT
  USING (true);

CREATE POLICY "Only admins can modify exchange rates"
  ON public.exchange_rates FOR ALL
  USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
