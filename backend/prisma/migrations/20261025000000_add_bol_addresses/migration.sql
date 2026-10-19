ALTER TABLE "warehouses" ADD COLUMN "address" VARCHAR(300);
ALTER TABLE "warehouses" ADD COLUMN "city" VARCHAR(100);
ALTER TABLE "warehouses" ADD COLUMN "state" VARCHAR(50);
ALTER TABLE "warehouses" ADD COLUMN "zip" VARCHAR(20);
ALTER TABLE "warehouses" ADD COLUMN "phone" VARCHAR(50);

CREATE TABLE "ship_to_addresses" (
    "customer" VARCHAR(200) NOT NULL,
    "name" VARCHAR(200),
    "address" VARCHAR(300),
    "city" VARCHAR(100),
    "state" VARCHAR(50),
    "zip" VARCHAR(20),
    "location_no" VARCHAR(50),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ship_to_addresses_pkey" PRIMARY KEY ("customer")
);
