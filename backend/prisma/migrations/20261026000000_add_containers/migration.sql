CREATE TABLE "containers" (
    "id" SERIAL NOT NULL,
    "container_number" VARCHAR(50),
    "po_number" VARCHAR(200),
    "supplier" VARCHAR(200),
    "warehouse_id" INTEGER NOT NULL,
    "etd" DATE,
    "eta" DATE NOT NULL,
    "bl_number" VARCHAR(100),
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PRODUCTION',
    "received_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "containers" ADD CONSTRAINT "containers_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "restocks" ADD COLUMN "container_id" INTEGER;
ALTER TABLE "restocks" ADD COLUMN "received_quantity" INTEGER;

ALTER TABLE "restocks" ADD CONSTRAINT "restocks_container_id_fkey"
    FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
