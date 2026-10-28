-- Contacts carry their own role, categories, status and next follow-up
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "role" VARCHAR(50) NOT NULL DEFAULT 'Buyer';
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "categories" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "status" VARCHAR(50) NOT NULL DEFAULT 'Not Contacted';
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "next_follow_up" DATE;
UPDATE "crm_contacts" SET "categories" = ARRAY["category"] WHERE "category" IS NOT NULL AND "categories" = '{}';

-- Activity entries belong to a contact, and others on the same email are listed alongside
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "contact_id" INTEGER;
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "cc_contact_ids" INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "activity_logs_contact_id_date_idx" ON "activity_logs"("contact_id", "date");
