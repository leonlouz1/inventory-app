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

// One-time, when UPC groups are introduced: numbers with the same name, pack
// size and brand (one product in several colors) become a group, named like
// "Plastic Hanger 10 Pack". Single numbers stay ungrouped.
async function groupExistingUpcNumbers(prisma) {
  const named = await prisma.upcAssignment.findMany({ where: { name: { not: null } }, orderBy: { sku: "asc" } });
  const families = new Map();
  for (const a of named) {
    const key = `${a.name}|${a.packSize ?? ""}|${a.brand ?? ""}`;
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(a);
  }
  let created = 0;
  for (const members of families.values()) {
    if (members.length < 2) continue;
    const { name, packSize } = members[0];
    const group = await prisma.upcGroup.create({ data: { name: packSize ? `${name} ${packSize} Pack` : name } });
    await prisma.upcAssignment.updateMany({ where: { sku: { in: members.map((m) => m.sku) } }, data: { groupId: group.id } });
    created += 1;
  }
  if (created) console.log(`Grouped existing UPC numbers into ${created} groups`);
}

module.exports = { seedStorageHangers, groupExistingUpcNumbers };
