-- Categories whose work list shows a contact in the Active accounts section at the bottom
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "active_categories" TEXT[] NOT NULL DEFAULT '{}';
