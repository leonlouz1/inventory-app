-- Categories whose work list a contact is hidden from (still kept, just parked)
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "hidden_categories" TEXT[] NOT NULL DEFAULT '{}';
