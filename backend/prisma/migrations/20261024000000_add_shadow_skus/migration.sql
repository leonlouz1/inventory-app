ALTER TABLE "products" ADD COLUMN "shadow_parent_id" INTEGER;

ALTER TABLE "products" ADD CONSTRAINT "products_shadow_parent_id_fkey"
    FOREIGN KEY ("shadow_parent_id") REFERENCES "products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
