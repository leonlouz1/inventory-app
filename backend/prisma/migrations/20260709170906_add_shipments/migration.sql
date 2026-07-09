-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shipment_id" INTEGER;

-- CreateTable
CREATE TABLE "shipments" (
    "id" SERIAL NOT NULL,
    "shipment_number" VARCHAR(50) NOT NULL,
    "pickup_date" TIMESTAMPTZ NOT NULL,
    "carrier" VARCHAR(200),
    "cs_number" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_shipment_number_key" ON "shipments"("shipment_number");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
