-- Agregar constraint UNIQUE al campo email de clients
-- Primero verificar si hay duplicados y renombrarlos
WITH duplicates AS (
  SELECT email, (SELECT id FROM clients c2 WHERE c2.email = c1.email ORDER BY created_at ASC NULLS LAST LIMIT 1) as keep_id
  FROM clients c1
  WHERE email IS NOT NULL
  GROUP BY email
  HAVING COUNT(*) > 1
)
UPDATE clients c
SET email = c.email || '_dup_' || c.id::text
FROM duplicates d
WHERE c.email = d.email AND c.id != d.keep_id;

-- Ahora crear el constraint UNIQUE
ALTER TABLE clients ADD CONSTRAINT clients_email_unique UNIQUE (email);