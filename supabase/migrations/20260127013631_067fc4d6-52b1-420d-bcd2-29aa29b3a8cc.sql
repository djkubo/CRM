-- Paso 1: Limpiar duplicados en ghl_contacts_raw (mantener solo el más reciente)
DELETE FROM ghl_contacts_raw a
USING ghl_contacts_raw b
WHERE a.external_id = b.external_id
  AND a.fetched_at < b.fetched_at;

-- Paso 2: Limpiar duplicados en manychat_contacts_raw (mantener solo el más reciente)
DELETE FROM manychat_contacts_raw a
USING manychat_contacts_raw b
WHERE a.subscriber_id = b.subscriber_id
  AND a.fetched_at < b.fetched_at;

-- Paso 3: Agregar constraint único en ghl_contacts_raw.external_id
ALTER TABLE ghl_contacts_raw 
DROP CONSTRAINT IF EXISTS ghl_contacts_raw_external_id_key;

ALTER TABLE ghl_contacts_raw 
ADD CONSTRAINT ghl_contacts_raw_external_id_key UNIQUE (external_id);

-- Paso 4: Agregar constraint único en manychat_contacts_raw.subscriber_id
ALTER TABLE manychat_contacts_raw 
DROP CONSTRAINT IF EXISTS manychat_contacts_raw_subscriber_id_key;

ALTER TABLE manychat_contacts_raw 
ADD CONSTRAINT manychat_contacts_raw_subscriber_id_key UNIQUE (subscriber_id);