CREATE TABLE IF NOT EXISTS "cost_origins" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    CONSTRAINT "cost_origins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cost_origins_name_key" ON "cost_origins"("name");

CREATE TABLE IF NOT EXISTS "cost_destinations" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "warehouse_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT "cost_destinations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cost_destinations_name_key" ON "cost_destinations"("name");

CREATE TABLE IF NOT EXISTS "freight_routes" (
    "id" SERIAL NOT NULL,
    "origin_id" INTEGER NOT NULL REFERENCES "cost_origins"("id") ON DELETE CASCADE,
    "destination_id" INTEGER NOT NULL REFERENCES "cost_destinations"("id") ON DELETE CASCADE,
    "container_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "freight_routes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "freight_routes_origin_id_destination_id_key" ON "freight_routes"("origin_id", "destination_id");

CREATE TABLE IF NOT EXISTS "product_sourcing" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "origin_id" INTEGER NOT NULL REFERENCES "cost_origins"("id") ON DELETE CASCADE,
    "factory_price" DECIMAL(10,4) NOT NULL,
    "hts_code" VARCHAR(20),
    "duty_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "extra_duty_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "units_per_container" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_sourcing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_sourcing_product_id_origin_id_key" ON "product_sourcing"("product_id", "origin_id");

INSERT INTO "cost_origins" ("name") VALUES ('China'), ('Thailand') ON CONFLICT DO NOTHING;
INSERT INTO "cost_destinations" ("name") VALUES ('New York'), ('Los Angeles') ON CONFLICT DO NOTHING;
