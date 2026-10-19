const hangers = require("../data/storageHangers.json");
const { otherProductName } = require("./upc");
const { createUpcProduct } = require("./upcProducts");

const STORAGE_RANGE = { code: "23", name: "Storage & Organization" };
const STORAGE_CATEGORY = "Storage & Organization";

// One-time load of the 23xxx hangers that were assigned in the old UPC
// spreadsheet: creates the "23 Storage & Organization" range, marks each
// number in use with its details, and adds its product (unless that SKU is
// already a product). Runs only while the 23 range doesn't exist yet.
async function seedStorageHangers(prisma) {
  const existing = await prisma.upcCode.findUnique({
    where: { kind_code: { kind: "range", code: STORAGE_RANGE.code } },
  });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    await tx.upcCode.create({ data: { kind: "range", ...STORAGE_RANGE } });
    for (const h of hangers) {
      const details = { name: h.name, color: h.color, category: STORAGE_CATEGORY, packSize: h.packSize };
      await tx.upcAssignment.upsert({
        where: { sku: h.sku },
        update: { inUse: true, ...details },
        create: { sku: h.sku, inUse: true, ...details },
      });
      const product = await tx.product.findUnique({ where: { sku: h.sku } });
      if (!product) {
        await createUpcProduct(tx, {
          sku: h.sku,
          name: otherProductName(details),
          color: h.color,
          category: STORAGE_CATEGORY,
          attributes: h.packSize ? { packSize: String(h.packSize) } : undefined,
        });
      }
    }
  }, { timeout: 60000 });
  console.log(`Loaded ${hangers.length} Storage & Organization UPCs`);
}

module.exports = { seedStorageHangers };
