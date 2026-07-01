-- AlterTable
ALTER TABLE "restocks" ADD COLUMN     "linked_order_id" INTEGER;

-- AddForeignKey
ALTER TABLE "restocks" ADD CONSTRAINT "restocks_linked_order_id_fkey" FOREIGN KEY ("linked_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
