-- Categories pitched to a contact that they haven't confirmed they buy
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "pitched_categories" TEXT[] NOT NULL DEFAULT '{}';
