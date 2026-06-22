-- DropForeignKey
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_warehouse_id_fkey";

-- AlterTable
ALTER TABLE "order_lines" ALTER COLUMN "warehouse_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
