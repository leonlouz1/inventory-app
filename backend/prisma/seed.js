const prisma = require("../src/prismaClient");
const { PRODUCT_CATEGORIES } = require("../src/constants/categories");

// Deterministic PRNG so reseeds are reproducible across runs.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const WAREHOUSES = [
  { name: "East", location: "Newark, NJ" },
  { name: "West", location: "Reno, NV" },
  { name: "Central", location: "Kansas City, MO" },
  { name: "South", location: "Dallas, TX" },
];

// SKU prefix/label families — distinct from the business `category` field below,
// just used to generate readable SKUs/names.
const SKU_FAMILIES = [
  { prefix: "WDG", label: "Widget" },
  { prefix: "PKG", label: "Packaging Unit" },
  { prefix: "GAD", label: "Gadget" },
  { prefix: "ACC", label: "Accessory" },
  { prefix: "TKT", label: "Tooling Kit" },
  { prefix: "FAS", label: "Fastener Set" },
  { prefix: "MNT", label: "Mount Bracket" },
  { prefix: "CBL", label: "Cable Assembly" },
];

const SUPPLIERS = [
  "Acme Manufacturing",
  "Nova Components",
  "Pioneer Supply Co",
  "Summit Industrial",
  "BlueRock Parts",
  "Meridian Sourcing",
];

const CUSTOMERS = [
  "Acme Corp",
  "Globex Inc",
  "Initech",
  "Umbrella Logistics",
  "Stark Retail",
  "Wayne Distribution",
  "Hooli Supply",
  "Vandelay Industries",
];

const PRODUCT_COUNT = 220;
const ORDER_COUNT = 60;
const RESTOCK_COUNT = 90;

async function main() {
  console.log("Clearing existing data...");
  await prisma.orderLine.deleteMany();
  await prisma.order.deleteMany();
  await prisma.restock.deleteMany();
  await prisma.warehouseStock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  console.log("Creating warehouses...");
  const warehouses = [];
  for (const w of WAREHOUSES) {
    warehouses.push(await prisma.warehouse.create({ data: w }));
  }

  console.log(`Creating ${PRODUCT_COUNT} products...`);
  const products = [];
  const counters = {};
  for (let i = 0; i < PRODUCT_COUNT; i++) {
    const family = pick(SKU_FAMILIES);
    counters[family.prefix] = (counters[family.prefix] || 0) + 1;
    const sku = `${family.prefix}-${String(counters[family.prefix]).padStart(3, "0")}`;
    const product = await prisma.product.create({
      data: {
        sku,
        name: `${family.label} ${counters[family.prefix]}`,
        category: pick(PRODUCT_CATEGORIES),
        reorderPoint: randInt(10, 100),
        reorderQty: randInt(50, 300),
        leadTimeDays: randInt(14, 45),
      },
    });
    products.push(product);
  }

  console.log("Creating warehouse stock...");
  for (const product of products) {
    for (const warehouse of warehouses) {
      // Bias toward healthy stock but leave some products thin or empty,
      // so dashboards/alerts have real shortfalls to show.
      const onHand = rand() < 0.1 ? 0 : randInt(0, 400);
      await prisma.warehouseStock.create({
        data: { productId: product.id, warehouseId: warehouse.id, onHand },
      });
    }
  }

  const today = new Date();

  console.log(`Creating ${RESTOCK_COUNT} restocks...`);
  for (let i = 0; i < RESTOCK_COUNT; i++) {
    const product = pick(products);
    const warehouse = pick(warehouses);
    await prisma.restock.create({
      data: {
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: randInt(20, 500),
        expectedDate: addDays(today, randInt(-10, 120)),
        supplier: pick(SUPPLIERS),
      },
    });
  }

  console.log(`Creating ${ORDER_COUNT} orders...`);
  for (let i = 0; i < ORDER_COUNT; i++) {
    const orderDate = addDays(today, randInt(-30, 0));
    const order = await prisma.order.create({
      data: {
        orderNumber: `SO-${1000 + i}`,
        customer: pick(CUSTOMERS),
        orderDate,
        notes: rand() < 0.15 ? "Priority customer — handle with care" : null,
      },
    });

    const lineCount = randInt(1, 5);
    for (let j = 0; j < lineCount; j++) {
      const product = pick(products);
      const warehouse = pick(warehouses);
      await prisma.orderLine.create({
        data: {
          orderId: order.id,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: randInt(5, 150),
          shipDate: addDays(today, randInt(1, 180)),
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`  Warehouses: ${warehouses.length}`);
  console.log(`  Products:   ${products.length}`);
  console.log(`  Restocks:   ${RESTOCK_COUNT}`);
  console.log(`  Orders:     ${ORDER_COUNT}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
