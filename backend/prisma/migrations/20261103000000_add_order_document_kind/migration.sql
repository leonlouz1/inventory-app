-- Files added before types existed were POs from the new-order screen
ALTER TABLE "order_documents" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(30) NOT NULL DEFAULT 'PO';
ALTER TABLE "order_documents" ALTER COLUMN "kind" SET DEFAULT 'OTHER';
