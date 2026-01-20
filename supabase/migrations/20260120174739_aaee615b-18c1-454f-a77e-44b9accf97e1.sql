-- Step 1: Merge duplicates - keep the one with highest total_paid, merge data from others
WITH duplicates AS (
  SELECT 
    lower(trim(email)) as normalized_email,
    array_agg(id ORDER BY COALESCE(total_paid, 0) DESC, created_at ASC) as ids,
    COUNT(*) as cnt
  FROM public.clients
  WHERE email IS NOT NULL
  GROUP BY lower(trim(email))
  HAVING COUNT(*) > 1
),
keeper AS (
  SELECT 
    d.normalized_email,
    d.ids[1] as keep_id,
    d.ids[2:] as delete_ids
  FROM duplicates d
)
-- Update keeper with best data from duplicates
UPDATE public.clients c SET
  phone = COALESCE(c.phone, (
    SELECT phone FROM public.clients 
    WHERE id = ANY(k.delete_ids) AND phone IS NOT NULL 
    LIMIT 1
  )),
  full_name = COALESCE(c.full_name, (
    SELECT full_name FROM public.clients 
    WHERE id = ANY(k.delete_ids) AND full_name IS NOT NULL 
    LIMIT 1
  )),
  total_paid = COALESCE(c.total_paid, 0) + COALESCE((
    SELECT SUM(COALESCE(total_paid, 0)) FROM public.clients 
    WHERE id = ANY(k.delete_ids)
  ), 0),
  lifecycle_stage = CASE 
    WHEN c.lifecycle_stage = 'CUSTOMER' THEN 'CUSTOMER'
    WHEN EXISTS (SELECT 1 FROM public.clients WHERE id = ANY(k.delete_ids) AND lifecycle_stage = 'CUSTOMER') THEN 'CUSTOMER'
    ELSE c.lifecycle_stage
  END
FROM keeper k
WHERE c.id = k.keep_id;

-- Step 2: Delete duplicate records (keeping the one with highest total_paid)
WITH duplicates AS (
  SELECT 
    lower(trim(email)) as normalized_email,
    array_agg(id ORDER BY COALESCE(total_paid, 0) DESC, created_at ASC) as ids
  FROM public.clients
  WHERE email IS NOT NULL
  GROUP BY lower(trim(email))
  HAVING COUNT(*) > 1
)
DELETE FROM public.clients
WHERE id IN (
  SELECT unnest(ids[2:]) FROM duplicates
);

-- Step 3: Now normalize all emails
UPDATE public.clients 
SET email = lower(trim(email))
WHERE email IS NOT NULL 
  AND (email != lower(email) OR email != trim(email));

-- Step 4: Create trigger function to auto-normalize emails
CREATE OR REPLACE FUNCTION public.normalize_client_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(trim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 5: Create trigger on clients table
DROP TRIGGER IF EXISTS trg_normalize_client_email ON public.clients;
CREATE TRIGGER trg_normalize_client_email
  BEFORE INSERT OR UPDATE OF email ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_client_email();