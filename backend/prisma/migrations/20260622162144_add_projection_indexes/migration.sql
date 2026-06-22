-- CreateIndex
CREATE INDEX "order_lines_product_id_warehouse_id_ship_date_idx" ON "order_lines"("product_id", "warehouse_id", "ship_date");

-- CreateIndex
CREATE INDEX "order_lines_ship_date_idx" ON "order_lines"("ship_date");

-- CreateIndex
CREATE INDEX "restocks_product_id_warehouse_id_expected_date_idx" ON "restocks"("product_id", "warehouse_id", "expected_date");

-- CreateIndex
CREATE INDEX "restocks_expected_date_idx" ON "restocks"("expected_date");
