-- Meeting recap text on a history entry, plus files kept with it (e.g. a recap PDF)
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "recap" TEXT;

CREATE TABLE IF NOT EXISTS "crm_attachments" (
    "id" SERIAL NOT NULL,
    "activity_log_id" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(150) NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_attachments_activity_log_id_fkey" FOREIGN KEY ("activity_log_id") REFERENCES "activity_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "crm_attachments_activity_log_id_idx" ON "crm_attachments"("activity_log_id");
