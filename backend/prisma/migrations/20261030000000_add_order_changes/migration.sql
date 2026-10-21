CREATE TABLE IF NOT EXISTS "order_changes" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "line_id" INTEGER,
    "sku" VARCHAR(50),
    "field" VARCHAR(50) NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "note" TEXT,
    "user_id" VARCHAR(100),
    "user_name" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_changes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "order_changes_order_id_created_at_idx" ON "order_changes"("order_id", "created_at");
