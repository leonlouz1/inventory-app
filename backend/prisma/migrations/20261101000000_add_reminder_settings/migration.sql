CREATE TABLE IF NOT EXISTS "reminder_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recipients" TEXT[] NOT NULL DEFAULT '{}',
    "upcoming_days" INTEGER NOT NULL DEFAULT 7,
    "cancel_days" INTEGER NOT NULL DEFAULT 7,
    "last_sent_on" DATE,
    CONSTRAINT "reminder_settings_pkey" PRIMARY KEY ("id")
);
