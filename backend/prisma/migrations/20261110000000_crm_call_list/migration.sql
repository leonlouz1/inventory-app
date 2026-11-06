-- Call List: buyers queued for cold calling
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "call_list_at" TIMESTAMPTZ;
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "call_list_category" VARCHAR(50);
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "call_list_note" VARCHAR(300);
