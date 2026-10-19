require("dotenv").config();
const express = require("express");
const cors = require("cors");
const prisma = require("./prismaClient");
const { authenticate } = require("./middleware/auth");
const { seedStorageHangers, groupExistingUpcNumbers } = require("./services/upcSeed");
const { seedProductFields } = require("./routes/productFields");

const productsRouter = require("./routes/products");
const ordersRouter = require("./routes/orders");
const restocksRouter = require("./routes/restocks");
const warehousesRouter = require("./routes/warehouses");
const timelineRouter = require("./routes/timeline");
const alertsRouter = require("./routes/alerts");
const shipmentsRouter = require("./routes/shipments");
const crmRouter = require("./routes/crm");
const importRouter = require("./routes/import");
const emailsRouter = require("./routes/emails");
const reportsRouter = require("./routes/reports");
const skuGroupsRouter = require("./routes/skuGroups");
const catalogRouter = require("./routes/catalog");
const billingRouter = require("./routes/billing");
const upcRouter = require("./routes/upc");
const { router: productFieldsRouter } = require("./routes/productFields");

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", authenticate);

app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/restocks", restocksRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/timeline", timelineRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/shipments", shipmentsRouter);
app.use("/api/crm", crmRouter);
app.use("/api/import", importRouter);
app.use("/api/emails", emailsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/sku-groups", skuGroupsRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/billing", billingRouter);
app.use("/api/upc", upcRouter);
app.use("/api/product-fields", productFieldsRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message && err.message.startsWith("Unknown SKU")) {
    return res.status(404).json({ message: err.message });
  }
  if (err.code === "P2025") {
    return res.status(404).json({ message: "Record not found" });
  }
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

async function runStartupMigrations() {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "product_groups" (
        "id" SERIAL NOT NULL,
        "name" VARCHAR(100) NOT NULL,
        CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
      )
    `;
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "product_groups_name_key" ON "product_groups"("name")
    `;
    await prisma.$executeRaw`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "group_id" INTEGER
    `;
    await prisma.$executeRaw`
      DO $$ BEGIN
        ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey"
          FOREIGN KEY ("group_id") REFERENCES "product_groups"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" TEXT`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "wholesale_price" DECIMAL(10,2)`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "retail_price" DECIMAL(10,2)`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(500)`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "case_pack" INTEGER NOT NULL DEFAULT 24`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "upc" VARCHAR(50)`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "color" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_type" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "embossment" VARCHAR(200)`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "attributes" JSONB NOT NULL DEFAULT '{}'`;
    await prisma.$executeRaw`ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ALLOCATED'`;
    await prisma.$executeRaw`ALTER TABLE "products" DROP COLUMN IF EXISTS "reorder_point"`;
    await prisma.$executeRaw`ALTER TABLE "products" DROP COLUMN IF EXISTS "reorder_qty"`;
    await prisma.$executeRaw`ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "container_number" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "carton_marking" VARCHAR(200)`;
    await prisma.$executeRaw`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "invoiced_at" TIMESTAMPTZ`;
    await prisma.$executeRaw`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipped_at" DATE`;
    await prisma.$executeRaw`ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "billing_address" VARCHAR(300)`;
    await prisma.$executeRaw`ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "billing_city" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "billing_state" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "retailers" ADD COLUMN IF NOT EXISTS "billing_zip" VARCHAR(20)`;
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "upc_codes" (
        "id" SERIAL NOT NULL,
        "kind" VARCHAR(10) NOT NULL,
        "code" VARCHAR(2) NOT NULL,
        "name" VARCHAR(100) NOT NULL,
        CONSTRAINT "upc_codes_pkey" PRIMARY KEY ("id")
      )
    `;
    await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "upc_codes_kind_code_key" ON "upc_codes"("kind", "code")`;
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "upc_assignments" (
        "sku" VARCHAR(5) NOT NULL,
        "in_use" BOOLEAN NOT NULL DEFAULT false,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "upc_assignments_pkey" PRIMARY KEY ("sku")
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO "upc_codes" ("kind", "code", "name") VALUES
        ('brand', '24', 'JetSet'),
        ('brand', '25', 'JetEase'),
        ('brand', '26', 'Catherine Malandrino'),
        ('brand', '27', 'Leluxe Travel')
      ON CONFLICT DO NOTHING
    `;
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "name" VARCHAR(200)`;
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "brand" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "color" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "category" VARCHAR(50)`;
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "pack_size" INTEGER`;
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "product_fields" (
        "key" VARCHAR(50) NOT NULL,
        "label" VARCHAR(100) NOT NULL,
        "options" JSONB,
        "categories" JSONB NOT NULL DEFAULT '{}',
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "product_fields_pkey" PRIMARY KEY ("key")
      )
    `;
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "attributes" JSONB NOT NULL DEFAULT '{}'`;
    // First time the groups table appears, group the existing numbers
    const [{ exists: hadUpcGroups }] = await prisma.$queryRaw`SELECT to_regclass('upc_groups') IS NOT NULL AS exists`;
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "upc_groups" (
        "id" SERIAL NOT NULL,
        "name" VARCHAR(200) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "upc_groups_pkey" PRIMARY KEY ("id")
      )
    `;
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "group_id" INTEGER`;
    await seedProductFields(prisma);
    await seedStorageHangers(prisma);
    if (!hadUpcGroups) await groupExistingUpcNumbers(prisma);
    console.log("Startup migrations complete");
  } catch (err) {
    console.error("Startup migration error:", err.message);
  }
}

runStartupMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`Inventory API listening on http://localhost:${PORT}`);
  });
});
