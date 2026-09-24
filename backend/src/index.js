require("dotenv").config();
const express = require("express");
const cors = require("cors");
const prisma = require("./prismaClient");

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

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

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
