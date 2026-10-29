require("dotenv").config();
const express = require("express");
const cors = require("cors");
const prisma = require("./prismaClient");
const { authenticate } = require("./middleware/auth");
const { seedStorageHangers, groupExistingUpcNumbers } = require("./services/upcSeed");
const { seedProductFields } = require("./routes/productFields");
const { moveRestocksIntoContainers } = require("./services/containers");

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
const containersRouter = require("./routes/containers");
const costsRouter = require("./routes/costs");
const imagesRouter = require("./routes/images");
const linesheetsRouter = require("./routes/linesheets");
const remindersRouter = require("./routes/reminders");
const orderDocumentsRouter = require("./routes/orderDocuments");
const { router: productFieldsRouter } = require("./routes/productFields");

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.set("trust proxy", true); // behind Render's proxy: req.protocol is https
app.use(express.json({ limit: "25mb" })); // image and PO uploads arrive as base64
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
app.use("/api/containers", containersRouter);
app.use("/api/costs", costsRouter);
app.use("/api/images", imagesRouter);
app.use("/api/reminders", remindersRouter);
app.use("/api/order-documents", orderDocumentsRouter);
app.use("/api/linesheets", linesheetsRouter);
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
    await prisma.$executeRaw`ALTER TABLE "products" ALTER COLUMN "case_pack" DROP NOT NULL`;
    await prisma.$executeRaw`ALTER TABLE "products" ALTER COLUMN "case_pack" DROP DEFAULT`;
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "case_pack" INTEGER`;
    // Travel exceptions: a style name that differs from the style code's
    await prisma.$executeRaw`ALTER TABLE "upc_assignments" ADD COLUMN IF NOT EXISTS "product_type" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shadow_parent_id" INTEGER`;
    await prisma.$executeRaw`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancel_date" DATE`;
    // Order change history
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "order_changes" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "line_id" INTEGER,
    "sku" VARCHAR(50),
    "field" VARCHAR(50) NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "note" TEXT,
    "user_id" VARCHAR(100),
    "user_name" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_changes_pkey" PRIMARY KEY ("id")
)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "order_changes_order_id_created_at_idx" ON "order_changes"("order_id", "created_at")`);
    // Uploaded images and linesheets
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "stored_images" (
    "id" SERIAL NOT NULL,
    "content_type" VARCHAR(50) NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stored_images_pkey" PRIMARY KEY ("id")
)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "linesheets" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "customer" VARCHAR(200),
    "notes" TEXT,
    "destination_id" INTEGER,
    "include_warehouse" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "linesheets_pkey" PRIMARY KEY ("id")
)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "linesheet_items" (
    "id" SERIAL NOT NULL,
    "linesheet_id" INTEGER NOT NULL REFERENCES "linesheets"("id") ON DELETE CASCADE,
    "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "block" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(10,2),
    "qty" INTEGER,
    "origin_id" INTEGER,
    CONSTRAINT "linesheet_items_pkey" PRIMARY KEY ("id")
)`);
    // PO files and other documents kept on orders
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "order_documents" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(150) NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploaded_by" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_documents_pkey" PRIMARY KEY ("id")
)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "order_documents_order_id_idx" ON "order_documents"("order_id")`);
    // File type; files added before types existed were POs
    await prisma.$executeRawUnsafe(`ALTER TABLE "order_documents" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(30) NOT NULL DEFAULT 'PO'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "order_documents" ALTER COLUMN "kind" SET DEFAULT 'OTHER'`);
    // Daily order reminder email (one settings row)
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "reminder_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recipients" TEXT[] NOT NULL DEFAULT '{}',
    "upcoming_days" INTEGER NOT NULL DEFAULT 7,
    "cancel_days" INTEGER NOT NULL DEFAULT 7,
    "last_sent_on" DATE,
    CONSTRAINT "reminder_settings_pkey" PRIMARY KEY ("id")
)`);
    // CRM: per-contact role/categories/status and per-contact history
    await prisma.$executeRawUnsafe(`ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "role" VARCHAR(50) NOT NULL DEFAULT 'Buyer'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "categories" TEXT[] NOT NULL DEFAULT '{}'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "status" VARCHAR(50) NOT NULL DEFAULT 'Not Contacted'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "next_follow_up" DATE`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "hidden_categories" TEXT[] NOT NULL DEFAULT '{}'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "active_categories" TEXT[] NOT NULL DEFAULT '{}'`);
    await prisma.$executeRawUnsafe(`UPDATE "crm_contacts" SET "categories" = ARRAY["category"] WHERE "category" IS NOT NULL AND "categories" = '{}'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "contact_id" INTEGER`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "cc_contact_ids" INTEGER[] NOT NULL DEFAULT '{}'`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN
      ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "activity_logs_contact_id_date_idx" ON "activity_logs"("contact_id", "date")`);
    // CRM: meeting recap text and files on history entries
    await prisma.$executeRawUnsafe(`ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "recap" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "crm_attachments" (
    "id" SERIAL NOT NULL,
    "activity_log_id" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(150) NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_attachments_activity_log_id_fkey" FOREIGN KEY ("activity_log_id") REFERENCES "activity_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "crm_attachments_activity_log_id_idx" ON "crm_attachments"("activity_log_id")`);
    // Landed cost tables (seeded with China/Thailand and New York/Los Angeles)
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "cost_origins" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    CONSTRAINT "cost_origins_pkey" PRIMARY KEY ("id")
)`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "cost_origins_name_key" ON "cost_origins"("name")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "cost_destinations" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "warehouse_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT "cost_destinations_pkey" PRIMARY KEY ("id")
)`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "cost_destinations_name_key" ON "cost_destinations"("name")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "freight_routes" (
    "id" SERIAL NOT NULL,
    "origin_id" INTEGER NOT NULL REFERENCES "cost_origins"("id") ON DELETE CASCADE,
    "destination_id" INTEGER NOT NULL REFERENCES "cost_destinations"("id") ON DELETE CASCADE,
    "container_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "freight_routes_pkey" PRIMARY KEY ("id")
)`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "freight_routes_origin_id_destination_id_key" ON "freight_routes"("origin_id", "destination_id")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "product_sourcing" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "origin_id" INTEGER NOT NULL REFERENCES "cost_origins"("id") ON DELETE CASCADE,
    "factory_price" DECIMAL(10,4) NOT NULL,
    "hts_code" VARCHAR(20),
    "duty_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "extra_duty_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "units_per_container" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_sourcing_pkey" PRIMARY KEY ("id")
)`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "product_sourcing_product_id_origin_id_key" ON "product_sourcing"("product_id", "origin_id")`);
    await prisma.$executeRawUnsafe(`INSERT INTO "cost_origins" ("name") VALUES ('China'), ('Thailand') ON CONFLICT DO NOTHING`);
    await prisma.$executeRawUnsafe(`INSERT INTO "cost_destinations" ("name") VALUES ('New York'), ('Los Angeles') ON CONFLICT DO NOTHING`);
    // Containers: first time the table appears, existing restocks are put into containers
    const [{ exists: hadContainers }] = await prisma.$queryRaw`SELECT to_regclass('containers') IS NOT NULL AS exists`;
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "containers" (
        "id" SERIAL NOT NULL,
        "container_number" VARCHAR(50),
        "po_number" VARCHAR(200),
        "supplier" VARCHAR(200),
        "warehouse_id" INTEGER NOT NULL,
        "etd" DATE,
        "eta" DATE NOT NULL,
        "bl_number" VARCHAR(100),
        "notes" TEXT,
        "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PRODUCTION',
        "received_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
      )
    `;
    await prisma.$executeRaw`
      DO $$ BEGIN
        ALTER TABLE "containers" ADD CONSTRAINT "containers_warehouse_id_fkey"
          FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `;
    await prisma.$executeRaw`ALTER TABLE "restocks" ADD COLUMN IF NOT EXISTS "container_id" INTEGER`;
    await prisma.$executeRaw`ALTER TABLE "restocks" ADD COLUMN IF NOT EXISTS "received_quantity" INTEGER`;
    await prisma.$executeRaw`
      DO $$ BEGIN
        ALTER TABLE "restocks" ADD CONSTRAINT "restocks_container_id_fkey"
          FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `;
    if (!hadContainers) await moveRestocksIntoContainers(prisma);
    await prisma.$executeRaw`ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "address" VARCHAR(300)`;
    await prisma.$executeRaw`ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "city" VARCHAR(100)`;
    await prisma.$executeRaw`ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "state" VARCHAR(50)`;
    await prisma.$executeRaw`ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "zip" VARCHAR(20)`;
    await prisma.$executeRaw`ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50)`;
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "ship_to_addresses" (
        "customer" VARCHAR(200) NOT NULL,
        "name" VARCHAR(200),
        "address" VARCHAR(300),
        "city" VARCHAR(100),
        "state" VARCHAR(50),
        "zip" VARCHAR(20),
        "location_no" VARCHAR(50),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ship_to_addresses_pkey" PRIMARY KEY ("customer")
      )
    `;
    await prisma.$executeRaw`
      DO $$ BEGIN
        ALTER TABLE "products" ADD CONSTRAINT "products_shadow_parent_id_fkey"
          FOREIGN KEY ("shadow_parent_id") REFERENCES "products"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `;
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
