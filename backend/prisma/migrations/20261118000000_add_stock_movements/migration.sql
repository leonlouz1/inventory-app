-- Stock history: every change to on-hand stock, with why and who
CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "change" INTEGER NOT NULL,
    "on_hand_after" INTEGER NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "order_id" INTEGER,
    "restock_id" INTEGER,
    "container_id" INTEGER,
    "user_name" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");
