CREATE TABLE "product_fields" (
    "key" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "options" JSONB,
    "categories" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "product_fields_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "upc_assignments" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';
