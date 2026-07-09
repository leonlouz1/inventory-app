-- CreateTable
CREATE TABLE "retailers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(100),
    "priority" VARCHAR(20) NOT NULL DEFAULT '1 - Low',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_categories" (
    "id" SERIAL NOT NULL,
    "retailer_id" INTEGER NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "buyer_name" VARCHAR(200),
    "status" VARCHAR(50) NOT NULL DEFAULT 'Not Contacted',

    CONSTRAINT "retailer_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" SERIAL NOT NULL,
    "retailer_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "title" VARCHAR(200),
    "email" VARCHAR(200),
    "direct_phone" VARCHAR(50),
    "hq_phone" VARCHAR(50),
    "category" VARCHAR(50),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" SERIAL NOT NULL,
    "retailer_id" INTEGER NOT NULL,
    "category" VARCHAR(50),
    "rep" VARCHAR(100),
    "date" DATE NOT NULL,
    "action_taken" VARCHAR(100) NOT NULL,
    "notes" TEXT,
    "next_step" VARCHAR(200),
    "next_step_date" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_items" (
    "id" SERIAL NOT NULL,
    "retailer_id" INTEGER NOT NULL,
    "category" VARCHAR(50),
    "buyer_name" VARCHAR(200),
    "date_sent" DATE NOT NULL,
    "item_sent" VARCHAR(100) NOT NULL,
    "notes" TEXT,
    "response_received" VARCHAR(50),
    "follow_up_date" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retailers_name_key" ON "retailers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_categories_retailer_id_category_key" ON "retailer_categories"("retailer_id", "category");

-- CreateIndex
CREATE INDEX "activity_logs_retailer_id_date_idx" ON "activity_logs"("retailer_id", "date");

-- CreateIndex
CREATE INDEX "activity_logs_next_step_date_done_idx" ON "activity_logs"("next_step_date", "done");

-- CreateIndex
CREATE INDEX "sent_items_retailer_id_idx" ON "sent_items"("retailer_id");

-- CreateIndex
CREATE INDEX "sent_items_follow_up_date_done_idx" ON "sent_items"("follow_up_date", "done");

-- AddForeignKey
ALTER TABLE "retailer_categories" ADD CONSTRAINT "retailer_categories_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_items" ADD CONSTRAINT "sent_items_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
