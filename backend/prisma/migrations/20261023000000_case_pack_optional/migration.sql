-- Case pack is set per product (Neck Pillows default to 24 in the forms);
-- other products no longer silently default to 24.
ALTER TABLE "products" ALTER COLUMN "case_pack" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "case_pack" DROP DEFAULT;

ALTER TABLE "upc_assignments" ADD COLUMN "case_pack" INTEGER;
