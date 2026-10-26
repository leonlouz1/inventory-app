CREATE TABLE IF NOT EXISTS "order_documents" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(150) NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploaded_by" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "order_documents_order_id_idx" ON "order_documents"("order_id");
