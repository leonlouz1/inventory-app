CREATE TABLE IF NOT EXISTS "stored_images" (
    "id" SERIAL NOT NULL,
    "content_type" VARCHAR(50) NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stored_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "linesheets" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "customer" VARCHAR(200),
    "notes" TEXT,
    "destination_id" INTEGER,
    "include_warehouse" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "linesheets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "linesheet_items" (
    "id" SERIAL NOT NULL,
    "linesheet_id" INTEGER NOT NULL REFERENCES "linesheets"("id") ON DELETE CASCADE,
    "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "block" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(10,2),
    "qty" INTEGER,
    "origin_id" INTEGER,
    CONSTRAINT "linesheet_items_pkey" PRIMARY KEY ("id")
)
;
