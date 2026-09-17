CREATE TABLE "product_groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_groups_name_key" ON "product_groups"("name");

ALTER TABLE "products" ADD COLUMN "group_id" INTEGER;

ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "product_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
