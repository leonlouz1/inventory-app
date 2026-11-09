-- Scheduled meetings (CRM → Meetings calendar)
CREATE TABLE IF NOT EXISTS "crm_meetings" (
    "id" SERIAL NOT NULL,
    "retailer_id" INTEGER NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "category" VARCHAR(50),
    "starts_at" TIMESTAMPTZ NOT NULL,
    "location_type" VARCHAR(50) NOT NULL,
    "address" VARCHAR(300),
    "link" VARCHAR(500),
    "attendee_ids" INTEGER[] NOT NULL DEFAULT '{}',
    "our_attendees" TEXT[] NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    "scheduled_log_id" INTEGER,
    "recap_log_id" INTEGER,
    "rep" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_meetings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_meetings_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "crm_meetings_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "crm_meetings_starts_at_idx" ON "crm_meetings"("starts_at");
CREATE INDEX IF NOT EXISTS "crm_meetings_contact_id_idx" ON "crm_meetings"("contact_id");
